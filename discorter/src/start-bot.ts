import { REST } from '@discordjs/rest';
import { Options, Partials, Routes } from 'discord.js';
import { createRequire } from 'node:module';
import 'dotenv/config';

import { Button } from './buttons/index.js';
import { DevCommand, HelpCommand, InfoCommand, TestCommand, TagCommand } from './commands/chat/index.js';
import {
    ChatCommandMetadata,
    Command,
    MessageCommandMetadata,
    UserCommandMetadata,
} from './commands/index.js';
import { ViewDateSent } from './commands/message/index.js';
import { ViewDateJoined } from './commands/user/index.js';
import {
    ButtonHandler,
    CommandHandler,
    GuildJoinHandler,
    GuildLeaveHandler,
    MessageHandler,
    ReactionHandler,
    TriggerHandler,
} from './events/index.js';
import { CustomClient } from './extensions/index.js';
import { Job } from './jobs/index.js';
import { Bot } from './models/bot.js';
import { Reaction } from './reactions/index.js';
import {
    CommandRegistrationService,
    EventDataService,
    JobService,
    Logger,
} from './services/index.js';
import { Trigger } from './triggers/index.js';

const require = createRequire(import.meta.url);
let Config = require('../config/config.json');
let Logs = require('../lang/logs.json');

async function start(): Promise<void> {
    // Services
    let eventDataService = new EventDataService();

    // Client
    let client = new CustomClient({
        intents: Config.client.intents,
        partials: (Config.client.partials as string[]).map(partial => Partials[partial]),
        makeCache: Options.cacheWithLimits({
            // Keep default caching behavior
            ...Options.DefaultMakeCacheSettings,
            // Override specific options from config
            ...Config.client.caches,
        }),
    });

    // Commands
    let commands: Command[] = [
        // Chat Commands
        new DevCommand(),
        new HelpCommand(),
        new InfoCommand(),
        new TestCommand(),
        
        // Sorter Chat Commands
        new TagCommand(),
        
        // Message Context Commands
        new ViewDateSent(),
        
        // User Context Commands
        new ViewDateJoined(),
    ];

    // Buttons
    let buttons: Button[] = [
        // TODO: Add new buttons here
    ];

    // Reactions
    let reactions: Reaction[] = [
        // TODO: Add new reactions here
    ];

    // Triggers
    let triggers: Trigger[] = [
        // TODO: Add new triggers here
    ];

    // Event handlers
    let guildJoinHandler = new GuildJoinHandler(eventDataService);
    let guildLeaveHandler = new GuildLeaveHandler();
    let commandHandler = new CommandHandler(commands, eventDataService);
    let buttonHandler = new ButtonHandler(buttons, eventDataService);
    let triggerHandler = new TriggerHandler(triggers, eventDataService);
    let messageHandler = new MessageHandler(triggerHandler);
    let reactionHandler = new ReactionHandler(reactions, eventDataService);

    // Jobs
    let jobs: Job[] = [
        // TODO: Add new jobs here
    ];

    // Bot
    let bot = new Bot(
        Config.client.token,
        client,
        guildJoinHandler,
        guildLeaveHandler,
        messageHandler,
        commandHandler,
        buttonHandler,
        reactionHandler,
        new JobService(jobs)
    );

    // Register
    if (process.argv[2] == 'commands') {
        try {
            let rest = new REST({ version: '10' }).setToken(Config.client.token);
            let commandRegistrationService = new CommandRegistrationService(rest);
            let localCmds = [
                ...Object.values(ChatCommandMetadata).sort((a, b) => (a.name > b.name ? 1 : -1)),
                ...Object.values(MessageCommandMetadata).sort((a, b) => (a.name > b.name ? 1 : -1)),
                ...Object.values(UserCommandMetadata).sort((a, b) => (a.name > b.name ? 1 : -1)),
            ];
            
            // For guild-specific command registration
            if (process.argv[3] == 'register:guild' && Config.client.guildId) {
                Logger.info(Logs.info.commandsAttemptGuild || 'Attempting to register commands to development server...');
                
                try {
                    // Add "(developer command)" to descriptions for guild commands
                    const guildCmds = localCmds.map(cmd => {
                        const cmdCopy = { ...cmd };
                        // Check if it's a ChatInput command type (which has description)
                        if ('description' in cmdCopy && typeof cmdCopy.description === 'string') {
                            cmdCopy.description = `${cmdCopy.description} (developer command)`;
                        }
                        return cmdCopy;
                    });
                    
                    const guildId = Config.client.guildId;
                    Logger.info(`Registering commands to guild: ${guildId}`);
                    const data = await rest.put(
                        Routes.applicationGuildCommands(Config.client.id || Config.client.clientId, guildId),
                        { body: guildCmds }
                    ) as any[];
                    Logger.info(`Successfully registered ${data.length} commands to guild ${guildId}`);
                    Logger.info(Logs.info.commandsRegisteredGuild || 'Commands registered to development server');
                } catch (error) {
                    Logger.error('Failed to register commands to development guild', error);
                }
            } else {
                await commandRegistrationService.process(localCmds, process.argv);
            }
        } catch (error) {
            Logger.error(Logs.error.commandAction, error);
        }
        // Wait for any final logs to be written.
        await new Promise(resolve => setTimeout(resolve, 1000));
        process.exit();
    }

    await bot.start();
}

process.on('unhandledRejection', (reason, _promise) => {
    Logger.error(Logs.error.unhandledRejection, reason);
});

start().catch(error => {
    Logger.error(Logs.error.unspecified, error);
});
