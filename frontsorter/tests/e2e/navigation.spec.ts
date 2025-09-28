import { expect, test } from '@playwright/test';

test.describe('Room navigation experience', () => {
  test.beforeEach(async ({ page }) => {
    const sessionResponse = {
      authenticated: true,
      session_type: 'full',
      user: {
        id: 'user-1',
        handle: 'demo.user',
        display_name: 'Demo User',
        email: 'demo@example.com',
      },
      temp_data: null,
    };

    const pairPayload = {
      left_entity: {
        ns: 'spotify.track',
        pk: 'track-left',
        title: 'Left Track',
        metadata: {
          artists: [{ name: 'Left Artist' }],
          album: {
            name: 'Left Album',
            images: [{ url: 'https://example.com/left.jpg' }],
          },
        },
      },
      right_entity: {
        ns: 'spotify.track',
        pk: 'track-right',
        title: 'Right Track',
        metadata: {
          artists: [{ name: 'Right Artist' }],
          album: {
            name: 'Right Album',
            images: [{ url: 'https://example.com/right.jpg' }],
          },
        },
      },
    };

    const songsResponse = [
      {
        ns: 'spotify.track',
        pk: 'track-left',
        title: 'Left Track',
        artist: 'Left Artist',
        album_art: 'https://example.com/left.jpg',
        metadata: pairPayload.left_entity.metadata,
      },
      {
        ns: 'spotify.track',
        pk: 'track-right',
        title: 'Right Track',
        artist: 'Right Artist',
        album_art: 'https://example.com/right.jpg',
        metadata: pairPayload.right_entity.metadata,
      },
    ];

    const rankingResponse = {
      sorted: [
        { identifier: { ns: 'spotify.track', pk: 'track-left' }, score: 0.9 },
        { identifier: { ns: 'spotify.track', pk: 'track-right' }, score: 0.7 },
      ],
      unsorted: [],
    };

    const poolResponse = [
      {
        ns: 'spotify.track',
        pk: 'track-left',
        title: 'Left Track',
        profile_picture_url: null,
        metadata: pairPayload.left_entity.metadata,
        pool_status: 'in_pool',
        status_updated_at: null,
      },
      {
        ns: 'spotify.track',
        pk: 'track-right',
        title: 'Right Track',
        profile_picture_url: null,
        metadata: pairPayload.right_entity.metadata,
        pool_status: 'unclassified',
        status_updated_at: null,
      },
    ];

    const fulfillJson = (body: unknown, status = 200) => ({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

    await page.route('**', async (route) => {
      const url = new URL(route.request().url());
      const { pathname } = url;
      const method = route.request().method();

      if (!pathname.startsWith('/api/')) {
        return route.continue();
      }

      if (method === 'OPTIONS') {
        return route.fulfill({ status: 204 });
      }

      if (pathname === '/api/auth/status') {
        return route.fulfill(fulfillJson(sessionResponse));
      }

      if (pathname === '/api/auth/spotify-token') {
        return route.fulfill(fulfillJson({ access_token: 'fake-token' }));
      }

      if (pathname === '/api/pair') {
        return route.fulfill(fulfillJson(pairPayload));
      }

      if (pathname === '/api/auth/spotify-songs') {
        return route.fulfill(fulfillJson(songsResponse));
      }

      if (pathname === '/api/rank/rank') {
        return route.fulfill(fulfillJson(rankingResponse));
      }

      if (pathname === '/api/vote') {
        if (method === 'GET') {
          return route.fulfill(fulfillJson([]));
        }
        return route.fulfill(fulfillJson({ ok: true }));
      }

      if (pathname === '/api/pool/list') {
        return route.fulfill(fulfillJson(poolResponse));
      }

      if (pathname.startsWith('/api/pool/')) {
        return route.fulfill(fulfillJson({
          entity_ns: 'spotify.track',
          entity_pk: pathname.split('/').slice(-2)[0] ?? 'track-left',
          status: 'in_pool',
          status_updated_at: new Date().toISOString(),
        }));
      }

      return route.fulfill(fulfillJson({ message: 'Unhandled in mock' }, 404));
    });

    await page.route('https://api.spotify.com/**', (route) => route.fulfill({ status: 204 }));
  });

  test('keyboard and door navigation moves between rooms', async ({ page }) => {
    await page.goto('/map/spotify/0,0');

    const title = page.locator('.room-shell__title h2');

    await expect(title).toHaveText('Pairing Chamber');
    await expect(page.getByText('Choose Your Champion')).toBeVisible();
    await expect(page.getByText('0 votes today')).toBeVisible();

    const sendKey = async (key: string, options: KeyboardEventInit = {}) => {
      await page.evaluate(({ key: k, options: opts }) => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }));
      }, { key, options });
    };

    await sendKey('w');
    await page.waitForTimeout(100);
    await expect.poll(() => page.evaluate(() => window.location.pathname)).toContain('/map/spotify/0,1');
    await expect(title).toHaveText('Ranked List');
    await expect(page.getByText('Top Seeds')).toBeVisible();

    await sendKey('d');
    await expect(title).toHaveText('Ranked List');

    await sendKey('s');
    await expect.poll(() => page.evaluate(() => window.location.pathname)).toContain('/map/spotify/0,0');
    await expect(title).toHaveText('Pairing Chamber');

    await sendKey('a');
    await expect.poll(() => page.evaluate(() => window.location.pathname)).toContain('/map/spotify/-1,0');
    await expect(title).toHaveText('Pool Builder');
    await expect(page.getByRole('heading', { level: 3, name: 'Pool Builder' })).toBeVisible();

    await page.getByRole('button', { name: /Pairing Chamber/i }).click();
    await expect(title).toHaveText('Pairing Chamber');

    await sendKey('s');
    await expect.poll(() => page.evaluate(() => window.location.pathname)).toContain('/map/spotify/0,-1');
    await expect(title).toHaveText('Device Hangar');

    await sendKey('ArrowUp', { shiftKey: true });
    await expect.poll(() => page.evaluate(() => window.location.pathname)).toContain('/map/spotify/0,1');
    await expect(title).toHaveText('Ranked List');
  });
});
