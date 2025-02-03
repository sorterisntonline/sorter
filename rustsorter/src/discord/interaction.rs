mod create_tag;

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
            .option(StringBuilder::new("name", "Name of the tag"));

    http.interaction(application_id)
        .set_global_commands(&[create_tag_command.build()])
        .await?;

    Ok(())
}

pub async fn handle_interaction(
    http: &Client,
    interaction: Interaction,
) -> Result<(), anyhow::Error> {
    match interaction.data {
        Some(InteractionData::Command(command)) => match command.name.as_str() {
            "create_tag" => create_tag(http, interaction).await,
        },
    }

    Ok(())
}
