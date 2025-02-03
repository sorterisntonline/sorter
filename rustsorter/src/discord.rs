mod interaction;

use twilight_gateway::{Config, EventTypeFlags, Intents, Shard, StreamExt as _};
use twilight_http::Client;

async fn handle_shard_events(mut shard: Shard) {
    while let Some(event) = shard.next_event(EventTypeFlags::MESSAGE_CREATE).await {
        if let Err(err) = &event {
            eprintln!("{err}");
        }
    }
}

pub async fn start(token: &str) -> Result<(), anyhow::Error> {
    let http = Client::new(token.to_owned());

    let application = http.current_user_application().await?.model().await?;
    let user = http.current_user().await?.model().await?;

    let shards = twilight_gateway::create_recommended(
        &http,
        Config::new(
            token.to_owned(),
            Intents::GUILD_MESSAGES | Intents::MESSAGE_CONTENT,
        ),
        |_, config_builder| config_builder.build(),
    )
    .await?
    .collect::<Vec<_>>();

    for shard in shards {
        tokio::spawn(async move {
            handle_shard_events(shard).await;
        });
    }

    interaction::create_commands(&http, application.id).await?;

    Ok(())
}
