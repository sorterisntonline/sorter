use serenity::async_trait;
use serenity::model::channel::Message;
use serenity::prelude::*;
use serenity::model::gateway::GatewayIntents;
use crate::AppState;
use std::sync::Arc;
use tokio::sync::oneshot;
struct Handler;

#[async_trait]
impl EventHandler for Handler {
    async fn message(&self, ctx: Context, msg: Message) {
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
    | GatewayIntents::MESSAGE_CONTENT;

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