mod create_tag;

use std::{sync::Arc, time::Duration};

use anyhow::anyhow;
use sparkle_interactions::{
    InteractionHandle,
    builder::InteractionResponseBuilder,
    extract::ExtractInteractionData,
};
use twilight_model::{
    application::interaction::Interaction,
    channel::message::MessageFlags,
    http::interaction::InteractionResponse,
};
use twilight_util::builder::{InteractionResponseDataBuilder, embed::EmbedBuilder};

use super::{Context, Ok, embed::Color};

impl Context {
    pub(super) async fn create_commands(&self) -> Result<(), anyhow::Error> {
        self.http
            .interaction(self.application_id)
            .set_global_commands(&[create_tag::command()])
            .await?;

        Ok(())
    }

    pub(super) async fn handle_interaction(
        self: Arc<Self>,
        interaction: Interaction,
    ) -> Result<(), anyhow::Error> {
        let handle = InteractionHandle::new(
            Arc::clone(&self.http),
            self.application_id,
            interaction.id,
            interaction.token.clone(),
        )
        .respond_on_delay(
            InteractionResponseBuilder::defer_send_message()
                .ephemeral()
                .build(),
            Duration::from_secs(2),
        );

        let ctx = InteractionContext {
            context: Arc::clone(&self),
            handle: handle.clone(),
            interaction,
        };

        let res = match ctx.interaction.data.as_ref().ok()?.custom_id().ok()? {
            "create_tag" => ctx.create_tag().await,
            _ => return Err(anyhow!("Unknown command")),
        };

        if let Err(err) = res {
            handle.respond(error_response()).await?;
            eprintln!("{err}");
        }

        Ok(())
    }
}

struct InteractionContext {
    context: Arc<Context>,
    handle: InteractionHandle,
    interaction: Interaction,
}

fn error_response() -> InteractionResponse {
    let embed = EmbedBuilder::new()
        .title("An error occurred")
        .description(
            "Something went wrong while trying to execute this command. We're working on fixing \
             the issue. Please try again later.",
        )
        .color(Color::Error.into())
        .build();

    let data = InteractionResponseDataBuilder::new()
        .embeds([embed])
        .flags(MessageFlags::EPHEMERAL)
        .build();

    InteractionResponseBuilder::send_message(data)
}
