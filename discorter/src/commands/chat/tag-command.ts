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

            Logger.info(`creating tag "${tagTitle}" for channel ${channelId} by user ${username} (${intr.user.id})`);

            // Create the tag via sorter API
            const apiUrl = `${process.env.SORTER_API_URL || 'http://localhost:3000/api'}/tag`;
            
            const requestData = {
                method: 'POST',
                headers: {
                    ...FetchOptions.headers,
                    'x-discord-user-id': intr.user.id,
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
            
            // Log the complete request structure before making the request
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
                    userId: intr.user.id,
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