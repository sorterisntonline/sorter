use serenity::async_trait;
use serenity::model::channel::Message;
use serenity::prelude::*;
use serenity::model::gateway::GatewayIntents;
use crate::AppState;
use std::sync::Arc;
use tokio::sync::oneshot;
use serenity::model::channel::{Channel, GuildChannel};
use serenity::model::id::ChannelId;

struct Handler;

#[async_trait]
impl EventHandler for Handler {
    async fn message(&self, ctx: Context, msg: Message) {
        if msg.author.bot {
            return;
        }
        if let Ok(channel) = msg.channel_id.to_channel(&ctx).await {
            println!("Channel: {}", channel);
            if let Channel::Guild(guild_channel) = channel {
                if let Some(category_id) = guild_channel.parent_id {
                    if let Ok(category) = category_id.to_channel(&ctx).await {
                        println!("Category: {}", category);
                        if let Channel::Guild(category) = category {
                            if category.name.to_lowercase() == "sorter" {
                                println!("Message received in sorter category!");
                                if let Err(why) = msg.channel_id.say(&ctx.http, "Message received in sorter category!").await {
                                    println!("Error sending message: {why:?}");
                                }
                            }
                        }
                    }
                } else {
                    println!("No category found");
                }
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
        .event_handler(Handler)
        .await.expect("Failed to create client");

    tokio::select! {
      _ = client.start() => {println!("Discord bot gracefully shut down");}
      _ = rx => {println!("Discord bot received shutdown signal");}
    }

    Ok(())
}