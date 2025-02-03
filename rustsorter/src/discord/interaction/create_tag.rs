use twilight_http::Client;
use twilight_model::application::interaction::{
    Interaction,
    application_command::{CommandData, CommandOptionValue},
};

async fn create_tag(http: &Client, data: CommandData) -> Result<(), anyhow::Error> {
    let CommandOptionValue::String(name) = data.options.first().unwrap().value else {
        panic!()
    };

    http.create_guild_channel(data.guild_id.unwrap(), &name)
        .await?;

    Ok(())
}
