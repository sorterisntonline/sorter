use serenity::async_trait;
use serenity::model::channel::Message;
use serenity::prelude::*;
use serenity::model::gateway::GatewayIntents;
use crate::AppState;
use std::sync::Arc;
use tokio::sync::oneshot;
use serenity::model::channel::{Channel, GuildChannel};
use serenity::model::id::ChannelId;
use std::collections::HashSet;
use tokio::sync::RwLock;

struct Handler {
    sorted_channels: Arc<RwLock<HashSet<ChannelId>>>,
    unsorted_channels: Arc<RwLock<HashSet<ChannelId>>>,
}

impl Handler {
    fn new() -> Self {
        Handler {
            sorted_channels: Arc::new(RwLock::new(HashSet::new())),
            unsorted_channels: Arc::new(RwLock::new(HashSet::new())),
        }
    }

    async fn is_sorted_channel(&self, channel_id: ChannelId, ctx: &Context) -> bool {
        // Check cache first
        if self.sorted_channels.read().await.contains(&channel_id) {
            return true;
        }
        if self.unsorted_channels.read().await.contains(&channel_id) {
            return false;
        }

        // If not in cache, perform lookup
        let is_sorted = match channel_id.to_channel(ctx).await {
            Ok(Channel::Guild(guild_channel)) => {
                if let Some(category_id) = guild_channel.parent_id {
                    match category_id.to_channel(ctx).await {
                        Ok(Channel::Guild(category)) => category.name.to_lowercase() == "sorter",
                        _ => false,
                    }
                } else {
                    false
                }
            }
            _ => false,
        };

        // Cache the result
        if is_sorted {
            self.sorted_channels.write().await.insert(channel_id);
        } else {
            self.unsorted_channels.write().await.insert(channel_id);
        }

        is_sorted
    }
}

#[async_trait]
impl EventHandler for Handler {
    async fn message(&self, ctx: Context, msg: Message) {
        if msg.author.bot {
            return;
        }

        if self.is_sorted_channel(msg.channel_id, &ctx).await {
            println!("Message received in sorter category!");
            if let Err(why) = msg.channel_id.say(&ctx.http, "Message received in sorter category!").await {
                println!("Error sending message: {why:?}");
            }
        }

        if msg.content == "!ping" {
            if let Err(why) = msg.channel_id.say(&ctx.http, "Pong!").await {
                println!("Error sending message: {why:?}");
            }
        }
    }
}

pub async fn run(state: Arc<AppState>, mut rx: oneshot::Receiver<()>) -> Result<(), Box<dyn std::error::Error>>{
    // ... (Your Serenity bot setup code from before) ...
    let token = std::env::var("DISCORD_TOKEN").expect("Expected a token in the environment");

    let intents = GatewayIntents::GUILD_MESSAGES
    | GatewayIntents::DIRECT_MESSAGES
    | GatewayIntents::MESSAGE_CONTENT
    | GatewayIntents::GUILDS;

    //Use state.db to access your database connection within commands
    let mut client = Client::builder(&token, intents)
        .event_handler(Handler::new())
        .await.expect("Failed to create client");

    tokio::select! {
      _ = client.start() => {println!("Discord bot gracefully shut down");}
      _ = rx => {println!("Discord bot received shutdown signal");}
    }

    Ok(())
}