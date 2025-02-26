import {
    ApplicationCommandOptionType,
    ApplicationCommandType,
    ChannelType,
    CommandInteraction,
    EmbedBuilder,
    PermissionFlagsBits,
    TextChannel,
} from 'discord.js';

import { ChatCommand, CommandDeferType } from '../../commands/index.js';
import { EventData } from '../../models/internal-models.js';
import { InteractionUtils } from '../../utils/index.js';
import { Lang } from '../../services/index.js';
import { FetchOptions } from '../../constants/fetch-options.js';

export class TagCommand implements ChatCommand {
    public names = ['tag'];
    public deferType = CommandDeferType.PUBLIC;
    public requireClientPerms = [];
    
    public metadata = {
        name: 'tag',
        description: 'create and link a sorter tag to this channel',
        type: ApplicationCommandType.ChatInput,
        options: [
            {
                name: 'title',
                description: 'the title of the tag',
                type: ApplicationCommandOptionType.String,
                required: true,
            },
            {
                name: 'description',
                description: 'a description of what this tag is for',
                type: ApplicationCommandOptionType.String,
                required: false,
            },
        ],
        defaultMemberPermissions: [PermissionFlagsBits.ManageChannels],
    };

    public async execute(intr: CommandInteraction, data: EventData): Promise<void> {
        if (!intr.channel || !(intr.channel instanceof TextChannel)) {
            await InteractionUtils.replyOrFollowUp(intr, {
                embeds: [
                    new EmbedBuilder()
                        .setDescription('this command can only be used in a text channel')
                        .setColor(Lang.getRef('colors.error', data.lang)),
                ],
            });
            return;
        }

        await InteractionUtils.sendDeferReply(intr);

        try {
            // Get Discord user info
            const username = intr.user.username;
            const tagTitle = intr.options.get('title')?.value as string;
            const tagDescription = (intr.options.get('description')?.value as string) || '';
            const channelId = intr.channelId;

            // Create the tag via sorter API
            const response = await fetch(`${process.env.SORTER_API_URL || 'http://localhost:3000'}/api/tag`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: tagTitle,
                    description: tagDescription,
                    discord_channel_id: channelId,
                    owner: `@discord_${username}`,
                }),
                ...FetchOptions,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`failed to create tag: ${errorData.message || response.statusText}`);
            }

            const tagData = await response.json();

            await InteractionUtils.replyOrFollowUp(intr, {
                embeds: [
                    new EmbedBuilder()
                        .setTitle('tag created')
                        .setDescription(`the tag "${tagTitle}" has been created and linked to this channel`)
                        .addFields([
                            { 
                                name: 'tag id', 
                                value: `${tagData.tags.id}`,
                                inline: true 
                            },
                            { 
                                name: 'owner', 
                                value: `@discord_${username}`,
                                inline: true 
                            }
                        ])
                        .setColor(Lang.getRef('colors.success', data.lang)),
                ],
            });
        } catch (error) {
            await InteractionUtils.replyOrFollowUp(intr, {
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`error: ${error instanceof Error ? error.message : String(error)}`)
                        .setColor(Lang.getRef('colors.error', data.lang)),
                ],
            });
        }
    }
} 