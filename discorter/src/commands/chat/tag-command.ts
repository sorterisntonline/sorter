import {
    ApplicationCommandOptionType,
    ApplicationCommandType,
    ChannelType,
    CommandInteraction,
    EmbedBuilder,
    PermissionFlagsBits,
    TextChannel,
    Colors,
} from 'discord.js';

import { Command, CommandDeferType } from '../../commands/index.js';
import { EventData } from '../../models/internal-models.js';
import { InteractionUtils, EnvUtils } from '../../utils/index.js';
import { Lang } from '../../services/index.js';
import { FetchOptions } from '../../constants/fetch-options.js';
import { Logger } from '../../services/index.js';

interface ErrorResponse {
    message: string;
}

interface TagResponse {
    id: string;
    title: string;
    slug?: string;
    description?: string;
    // Additional fields that might be returned
    ns?: string;
    domain_pk_namespace?: string;
    domain_pk?: string;
    owner?: string;
}

interface UserResponse {
    user_name: string;
    temporary?: boolean;
}

export class TagCommand implements Command {
    public names = ['tag'];
    public deferType = CommandDeferType.PUBLIC;
    public requireClientPerms = [];
    
    public async execute(intr: CommandInteraction, data: EventData): Promise<void> {
        if (!intr.channel || !(intr.channel instanceof TextChannel)) {
            Logger.warn(`tag command used outside of text channel by ${intr.user.username} (${intr.user.id})`);
            await InteractionUtils.send(intr, {
                embeds: [
                    new EmbedBuilder()
                        .setDescription('this command can only be used in a text channel')
                        .setColor(Colors.Red),
                ],
            });
            return;
        }

        try {
            // Get Discord user info
            const username = intr.user.username;
            const options = intr.options;
            const tagTitle = options.get('title')?.value as string || intr.channel.name;
            const tagDescription = options.get('description')?.value as string || '';
            const namespace = options.get('namespace')?.value as string || '';
            const channelId = intr.channelId;
            const discordUserId = intr.user.id;
            
            Logger.info(`checking if tag exists for channel ${channelId} requested by ${username} (${discordUserId})`);
            
            // Check if tag already exists for this channel
            const tagExistsUrl = `${process.env.SORTER_API_URL || 'http://localhost:3000/api'}/tag/exists`;
            const checkExistsData = {
                method: 'POST',
                headers: {
                    ...FetchOptions.headers,
                    'x-discord-user-id': discordUserId,
                    'x-discord-username': username,
                },
                body: JSON.stringify({
                    domain_pk_namespace: 'discord.channel',
                    domain_pk: channelId,
                }),
                timeout: FetchOptions.timeout,
            };
            
            Logger.debug(`checking if tag exists: ${tagExistsUrl}`, {
                url: tagExistsUrl,
                method: checkExistsData.method,
                headers: checkExistsData.headers,
                body: JSON.parse(checkExistsData.body),
                timeout: checkExistsData.timeout
            });
            
            const existsResponse = await fetch(tagExistsUrl, checkExistsData);
            const existsData = await existsResponse.json() as { exists: boolean } & Partial<TagResponse>;
            
            // If tag exists, check ownership
            if (existsData.exists) {
                Logger.info(`tag already exists for channel ${channelId}`);
                const existingTag = existsData as TagResponse;
                
                // Check if the user is the owner of the tag
                // First, get the sorter user associated with this discord ID
                const userLookupUrl = `${process.env.SORTER_API_URL || 'http://localhost:3000/api'}/users?discord_id=${discordUserId}`;
                const userResponse = await fetch(userLookupUrl, {
                    headers: FetchOptions.headers,
                    timeout: FetchOptions.timeout,
                } as RequestInit & { timeout: number });
                
                if (!userResponse.ok) {
                    Logger.warn(`failed to lookup user by discord_id ${discordUserId}`);
                    await InteractionUtils.editReply(intr, {
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`error: failed to verify user ownership`)
                                .setColor(Colors.Red),
                        ],
                    });
                    return;
                }
                
                const userData = await userResponse.json() as UserResponse;
                const isOwner = userData.user_name === existingTag.owner;
                
                if (!isOwner) {
                    // User is not the owner, send error message
                    Logger.info(`user ${username} (${discordUserId}) is not the owner of tag ${existingTag.id}`);
                    await InteractionUtils.editReply(intr, {
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`you cannot modify this tag because you are not the owner`)
                                .setColor(Colors.Red),
                        ],
                    });
                    return;
                }
                
                // Create a link to the tag for the owner
                const tagUrl = EnvUtils.getTagUrl(existingTag.id, existingTag.slug);
                
                // User is the owner, provide tag information and link to edit
                await InteractionUtils.editReply(intr, {
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('tag already exists')
                            .setDescription(`you own this tag "${existingTag.title}". you can edit it on the sorter website`)
                            .setURL(tagUrl)
                            .addFields([
                                { 
                                    name: 'owner', 
                                    value: `@${existingTag.owner}`,
                                    inline: true 
                                }
                            ])
                            .setColor(Colors.Blue),
                    ],
                });
                return;
            }

            // Tag doesn't exist, create a new one
            Logger.info(`creating tag "${tagTitle}" for channel ${channelId} by user ${username} (${discordUserId})`);

            // Create the tag via sorter API
            const apiUrl = `${process.env.SORTER_API_URL || 'http://localhost:3000/api'}/tag`;
            
            const requestData = {
                method: 'POST',
                headers: {
                    ...FetchOptions.headers,
                    'x-discord-user-id': discordUserId,
                    'x-discord-username': username,
                },
                body: JSON.stringify({
                    title: tagTitle,
                    description: tagDescription,
                    ns: namespace,
                    domain_pk_namespace: 'discord.channel',
                    domain_pk: channelId,
                }),
                timeout: FetchOptions.timeout,
            };
            
            Logger.debug(`making request to sorter api: ${apiUrl}`, {
                url: apiUrl,
                method: requestData.method,
                headers: requestData.headers,
                body: JSON.parse(requestData.body),
                timeout: requestData.timeout
            });
            
            const response = await fetch(apiUrl, requestData);

            if (!response.ok) {
                const errorData = await response.json() as ErrorResponse;
                const errorMessage = errorData.message || response.statusText;
                Logger.error(`failed to create tag: ${errorMessage}`, {
                    statusCode: response.status,
                    user: username,
                    userId: discordUserId,
                    channelId
                });
                throw new Error(`failed to create tag: ${errorMessage}`);
            }

            const tagData = await response.json() as TagResponse;
            Logger.info(`tag created successfully with id ${tagData.id} for channel ${channelId}`);

            // Create a URL for the tag
            const tagUrl = EnvUtils.getTagUrl(tagData.id, tagData.slug);

            await InteractionUtils.editReply(intr, {
                embeds: [
                    new EmbedBuilder()
                        .setTitle('tag created')
                        .setDescription(`the tag "${tagTitle}" has been created and linked to this channel`)
                        .setURL(tagUrl)
                        .setThumbnail('https://upload.wikimedia.org/wikipedia/commons/thumb/c/c6/Sign-check-icon.png/800px-Sign-check-icon.png')
                        .addFields([
                            { 
                                name: 'owner', 
                                value: `@discord_${username}`,
                                inline: true 
                            }
                        ])
                        .setColor(Colors.Green),
                ],
            });
        } catch (error) {
            Logger.error(`error in tag command execution`, error);
            await InteractionUtils.editReply(intr, {
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`error: ${error instanceof Error ? error.message : String(error)}`)
                        .setColor(Colors.Red),
                ],
            });
        }
    }
} 