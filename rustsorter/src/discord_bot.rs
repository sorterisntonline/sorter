use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

use serenity::{
    all::ReactionType,
    async_trait,
    model::{
        channel::{Channel, GuildChannel, Message, Reaction},
        gateway::GatewayIntents,
        id::ChannelId,
    },
    prelude::*,
};
use tokio::sync::{RwLock, oneshot};

use crate::AppState;

struct Handler {
    sorted_channels: Arc<RwLock<HashSet<ChannelId>>>,
    unsorted_channels: Arc<RwLock<HashSet<ChannelId>>>,
    channel_tag_ids: Arc<RwLock<HashMap<ChannelId, i32>>>,
    app_state: Arc<AppState>,
}

impl Handler {
    fn new(app_state: Arc<AppState>) -> Self {
        Handler {
            sorted_channels: Arc::new(RwLock::new(HashSet::new())),
            unsorted_channels: Arc::new(RwLock::new(HashSet::new())),
            channel_tag_ids: Arc::new(RwLock::new(HashMap::new())),
            app_state,
        }
    }

    async fn get_or_create_tag(&self, channel_name: &str) -> Option<i32> {
        let slug = channel_name.to_lowercase();
        println!("slug: {}", slug);

        // Try to find existing tag
        let existing_tag = sqlx::query!("SELECT id FROM tags WHERE slug = $1", slug)
            .fetch_optional(&self.app_state.db)
            .await
            .ok()?;

        if let Some(tag) = existing_tag {
            return Some(tag.id);
        }

        // Create new tag with permissions if it doesn't exist
        match create_tag_with_permissions(
            &self.app_state.db,
            "discord",
            channel_name,
            &slug,
            Some("Discord channel"),
            Some("discord.channel"),
            None,
        )
        .await
        {
            Ok(tag_id) => Some(tag_id),
            Err(_) => None,
        }
    }

    async fn is_sorted_channel(&self, channel_id: ChannelId, ctx: &Context) -> bool {
        // Check sorted/unsorted cache first
        if self.sorted_channels.read().await.contains(&channel_id) {
            return true;
        }
        if self.unsorted_channels.read().await.contains(&channel_id) {
            return false;
        }

        // Check if channel is in a "sorter" category
        let is_sorted = match channel_id.to_channel(ctx).await {
            Ok(Channel::Guild(guild_channel)) => {
                if let Some(category_id) = guild_channel.parent_id {
                    match category_id.to_channel(ctx).await {
                        Ok(Channel::Guild(category)) => {
                            if category.name.to_lowercase() == "sorter" {
                                // Get or create tag for this channel
                                if let Some(tag_id) =
                                    self.get_or_create_tag(&guild_channel.name).await
                                {
                                    // Cache the tag ID
                                    self.channel_tag_ids
                                        .write()
                                        .await
                                        .insert(channel_id, tag_id);
                                    true
                                } else {
                                    false
                                }
                            } else {
                                false
                            }
                        }
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

    async fn get_tag_id(&self, channel_id: ChannelId) -> Option<i32> {
        self.channel_tag_ids.read().await.get(&channel_id).copied()
    }

    async fn create_item(
        &self,
        message: &Message,
        channel_id: ChannelId,
        guild_id: Option<String>,
        tag_id: i32,
    ) {
        let url = if let Some(embed) = message.embeds.first() {
            embed.url.as_deref().unwrap_or(&message.content)
        } else {
            &message.content
        };

        let body = serde_json::json!({
            "title": message.content,
            "url": url,
            "tag_id": tag_id,
            "owner": "discord",
            "discord_channel_id": channel_id.to_string(),
            "discord_server_id": guild_id
        });

        // TODO: Get URL from env
        let client = reqwest::Client::new();
        let res = client
            .post("http://localhost:3000/api/item")
            .json(&body)
            .send()
            .await;

        match res {
            Ok(response) => {
                if !response.status().is_success() {
                    println!("Error creating item: {:?}", response.text().await);
                }
            }
            Err(e) => println!("Failed to create item: {}", e),
        }
    }
}

async fn create_tag_with_permissions(
    db: &sqlx::PgPool,
    owner: &str,
    title: &str,
    slug: &str,
    description: Option<&str>,
    domain_pk_namespace: Option<&str>,
    domain_pk: Option<&str>,
) -> Result<i32, sqlx::Error> {
    // Create the tag
    let tag = sqlx::query!(
        "INSERT INTO tags (owner, title, slug, description, domain_pk_namespace, domain_pk, \
         created_at, edited_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id",
        owner,
        title,
        slug,
        description,
        domain_pk_namespace,
        domain_pk
    )
    .fetch_one(db)
    .await?;

    // Insert default permissions
    for perm in vec![("view", "all"), ("vote", "all"), ("add", "none")] {
        sqlx::query!(
            "INSERT INTO perms (tag_id, capability, user_id) VALUES ($1, $2, $3)",
            tag.id,
            perm.0,
            perm.1,
        )
        .execute(db)
        .await?;
    }

    Ok(tag.id)
}

#[async_trait]
impl EventHandler for Handler {
    async fn message(&self, ctx: Context, msg: Message) {
        if msg.author.bot {
            return;
        }
    }

    async fn reaction_add(&self, ctx: Context, reaction: Reaction) {
        if self.is_sorted_channel(reaction.channel_id, &ctx).await {
            if let Ok(message) = reaction.message(&ctx).await {
                if let Some(tag_id) = self.get_tag_id(reaction.channel_id).await {
                    let guild_id = message.guild_id.map(|g| g.to_string());
                    self.create_item(&message, reaction.channel_id, guild_id, tag_id)
                        .await;
                }
            }
        }
    }
}

pub async fn run(
    state: Arc<AppState>,
    rx: oneshot::Receiver<()>,
) -> Result<(), Box<dyn std::error::Error>> {
    // Create discord user if it doesn't exist
    let result = sqlx::query!(
        "INSERT INTO users (user_name, created_at)
         VALUES ($1, CURRENT_TIMESTAMP)
         ON CONFLICT (user_name) DO NOTHING",
        "discord"
    )
    .execute(&state.db)
    .await;

    println!("result: {:?}", result);

    let token = std::env::var("DISCORD_TOKEN").expect("Expected a token in the environment");

    let intents = GatewayIntents::GUILD_MESSAGES
        | GatewayIntents::DIRECT_MESSAGES
        | GatewayIntents::MESSAGE_CONTENT
        | GatewayIntents::GUILDS
        | GatewayIntents::GUILD_MESSAGE_REACTIONS;

    // Use state.db to access your database connection within commands
    let mut client = Client::builder(&token, intents)
        .event_handler(Handler::new(state))
        .await
        .expect("Failed to create client");

    tokio::select! {
      _ = client.start() => {println!("Discord bot gracefully shut down");}
      _ = rx => {println!("Discord bot received shutdown signal");}
    }

    Ok(())
}
