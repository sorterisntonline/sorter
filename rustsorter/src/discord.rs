mod embed;
mod interaction;

use std::{any::type_name, sync::Arc};

use anyhow::anyhow;
use twilight_gateway::{Config, Event, EventTypeFlags, Intents, Shard, StreamExt as _};
use twilight_http::Client;
use twilight_model::id::{Id, marker::ApplicationMarker};

struct Context {
    application_id: Id<ApplicationMarker>,
    http: Arc<Client>,
}

impl Context {
    async fn handle_event(self: Arc<Self>, event: Event) {
        let res = match event {
            Event::InteractionCreate(interaction) => {
                Box::pin(self.handle_interaction(interaction.0)).await
            }
            _ => Ok(()),
        };

        if let Err(err) = res {
            eprintln!("{err}");
        }
    }

    async fn handle_shard_events(self: Arc<Self>, mut shard: Shard) {
        let event_types = EventTypeFlags::INTERACTION_CREATE;

        while let Some(event_res) = shard.next_event(event_types).await {
            let Ok(event) = event_res else {
                // TODO: use tracing library
                eprintln!("{}", event_res.unwrap_err());
                continue;
            };

            let ctx = Arc::clone(&self);
            tokio::spawn(async move {
                Box::pin(ctx.handle_event(event)).await;
            });
        }
    }
}

trait Ok<T> {
    fn ok(self) -> Result<T, anyhow::Error>;
}

impl<T> Ok<T> for Option<T> {
    fn ok(self) -> Result<T, anyhow::Error> {
        self.map_or_else(
            || Err(anyhow!("Option<{}> is None", type_name::<T>())),
            |value| Ok(value),
        )
    }
}

pub async fn start(token: &str) -> Result<(), anyhow::Error> {
    let http = Arc::new(Client::new(token.to_owned()));
    let application = http.current_user_application().await?.model().await?;

    let ctx = Arc::new(Context {
        http,
        application_id: application.id,
    });

    let shards = twilight_gateway::create_recommended(
        &ctx.http,
        Config::new(token.to_owned(), Intents::empty()),
        |_, config_builder| config_builder.build(),
    )
    .await?
    .collect::<Vec<_>>();

    ctx.create_commands().await?;

    for shard in shards {
        let context_clone = Arc::clone(&ctx);
        tokio::spawn(async move {
            context_clone.handle_shard_events(shard).await;
        });
    }

    Ok(())
}
