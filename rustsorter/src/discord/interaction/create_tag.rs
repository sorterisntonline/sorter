use twilight_http::Client;
use twilight_model::{
    application::interaction::application_command::{CommandData, CommandOptionValue},
    channel::ChannelType,
    http::interaction::{InteractionResponse, InteractionResponseType},
    id::{Id, marker::GuildMarker},
};
use twilight_util::builder::InteractionResponseDataBuilder;

pub async fn create_tag(
    http: &Client,
    data: CommandData,
    guild_id: Id<GuildMarker>,
) -> Result<InteractionResponse, anyhow::Error> {
    let CommandOptionValue::String(name) = &data.options.first().unwrap().value else {
        panic!()
    };

    let channels = http.guild_channels(guild_id).await?.models().await?;

    let category_id = if let Some(category) = channels
        .iter()
        .find(|c| c.name.as_ref().map(|name| name.to_lowercase()) == Some("sorter".to_owned()))
    {
        category.id
    } else {
        http.create_guild_channel(guild_id, "Sorter")
            .kind(ChannelType::GuildCategory)
            .await?
            .model()
            .await?
            .id
    };

    let channel_id = http
        .create_guild_channel(guild_id, &name)
        .parent_id(category_id)
        .await?
        .model()
        .await?
        .id;

    let response = InteractionResponse {
        kind: InteractionResponseType::ChannelMessageWithSource,
        data: Some(
            InteractionResponseDataBuilder::new()
                .content(format!("Created tag at <#{channel_id}>"))
                .build(),
        ),
    };

    Ok(response)
}
