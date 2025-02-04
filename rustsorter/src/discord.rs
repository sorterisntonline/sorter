mod interaction;

use std::sync::Arc;

use twilight_gateway::{Config, Event, EventTypeFlags, Intents, Shard, StreamExt as _};
use twilight_http::Client;
use twilight_model::id::{Id, marker::ApplicationMarker};

async fn handle_shard_events(
    mut shard: Shard,
    http: Arc<Client>,
    application_id: Id<ApplicationMarker>,
) {
    while let Some(event) = shard.next_event(EventTypeFlags::INTERACTION_CREATE).await {
        match event {
            Ok(Event::InteractionCreate(interaction)) => {
                let res =
                    interaction::handle_interaction(&http, application_id, interaction.0).await;

                if let Err(err) = res {
                    eprintln!("{err}");
                }
            }
            Err(err) => {
                eprintln!("{err}");
            }
            _ => {}
        }
    }
}

pub async fn start(token: &str) -> Result<(), anyhow::Error> {
    let http = Arc::new(Client::new(token.to_owned()));

    let application = http.current_user_application().await?.model().await?;

    let shards = twilight_gateway::create_recommended(
        &http,
        Config::new(token.to_owned(), Intents::empty()),
        |_, config_builder| config_builder.build(),
    )
    .await?
    .collect::<Vec<_>>();

    for shard in shards {
        let http_ref = Arc::clone(&http);
        tokio::spawn(async move {
            handle_shard_events(shard, http_ref, application.id).await;
        });
    }

    interaction::create_commands(&http, application.id).await?;

    Ok(())
}
