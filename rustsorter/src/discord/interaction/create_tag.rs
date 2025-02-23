use sparkle_interactions::{
    builder::InteractionResponseBuilder,
    extract::{ExtractInteractionData, ExtractOption, ExtractOptionValue},
};
use twilight_model::{
    application::command::{Command, CommandType},
    channel::ChannelType,
};
use twilight_util::builder::{
    InteractionResponseDataBuilder,
    command::{CommandBuilder, StringBuilder},
    embed::EmbedBuilder,
};

use super::InteractionContext;
use crate::discord::{Ok, embed::Color};

impl InteractionContext {
    pub(super) async fn create_tag(self) -> Result<(), anyhow::Error> {
        let name = self
            .interaction
            .data
            .ok()?
            .command_data()
            .ok()?
            .options
            .option("name")
            .ok()?
            .string()
            .ok()?;
        let guild_id = self.interaction.guild_id.ok()?;

        // TODO: use caching for this
        let channels = self
            .context
            .http
            .guild_channels(guild_id)
            .await?
            .models()
            .await?;

        let category_id = if let Some(category) = channels.iter().find(|channel| {
            channel
                .name
                .as_ref()
                .map(|channel_name| channel_name.to_lowercase())
                == Some("sorter".to_owned())
        }) {
            category.id
        } else {
            self.context
                .http
                .create_guild_channel(guild_id, "Sorter")
                .kind(ChannelType::GuildCategory)
                .await?
                .model()
                .await?
                .id
        };

        let channel_id = self
            .context
            .http
            .create_guild_channel(guild_id, &name)
            .parent_id(category_id)
            .await?
            .model()
            .await?
            .id;

        // TODO: add cute emojis to these embeds
        let embed = EmbedBuilder::new()
            .title("Created tag successfully")
            .description(format!("Your tag has been created at <#{channel_id}>"))
            .color(Color::Success.into())
            .build();

        let response = InteractionResponseBuilder::send_message(
            InteractionResponseDataBuilder::new()
                .embeds([embed])
                .build(),
        );

        self.handle.respond(response).await?;

        Ok(())
    }
}

pub(super) fn command() -> Command {
    CommandBuilder::new("create_tag", "Create a tag", CommandType::ChatInput)
        .option(StringBuilder::new("name", "Name of the tag").required(true))
        .build()
}
