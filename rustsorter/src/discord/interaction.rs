mod create_tag;

use anyhow::anyhow;
use create_tag::create_tag;
use twilight_http::Client;
use twilight_model::{
    application::{
        command::CommandType,
        interaction::{Interaction, InteractionData},
    },
    id::{Id, marker::ApplicationMarker},
};
use twilight_util::builder::command::{CommandBuilder, StringBuilder};

pub async fn create_commands(
    http: &Client,
    application_id: Id<ApplicationMarker>,
) -> Result<(), anyhow::Error> {
    let create_tag_command =
        CommandBuilder::new("create_tag", "Create a tag", CommandType::ChatInput)
            .option(StringBuilder::new("name", "Name of the tag").required(true));

    http.interaction(application_id)
        .set_global_commands(&[create_tag_command.build()])
        .await?;

    Ok(())
}

pub async fn handle_interaction(
    http: &Client,
    application_id: Id<ApplicationMarker>,
    interaction: Interaction,
) -> Result<(), anyhow::Error> {
    let response = match interaction.data {
        Some(InteractionData::ApplicationCommand(command)) => match command.name.as_str() {
            "create_tag" => create_tag(http, *command, interaction.guild_id.unwrap()).await?,
            _ => return Err(anyhow!("Unknown command: {}", command.name)),
        },
        _ => return Err(anyhow!("Unknown interaction type")),
    };

    http.interaction(application_id)
        .create_response(interaction.id, &interaction.token, &response)
        .await?;

    Ok(())
}
