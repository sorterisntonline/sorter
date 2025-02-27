# sorter API Documentation

This document outlines the HTTP API endpoints exposed by the **borter** Clojure backend for **sorter**. All routes described here (unless otherwise noted) are mounted under the prefix: `/api`.

The backend uses **session-based authentication**. A valid session is typically created via the [`/api/login`](#post-apilogin) endpoint. Once logged in, your browser session cookie is used on subsequent requests.

## Table of Contents

- [General Conventions](#general-conventions)
- [Authentication & Sessions](#authentication--sessions)
- [Health Check](#health-check)
- [Feed & Frontpage](#feed--frontpage)
- [Hierarchy](#hierarchy)
- [Leaderboard](#leaderboard)
- [Tag Management](#tag-management)
  - [GET /tag](#get-apitag)
  - [POST /tag](#post-apitag)
  - [DELETE /tag](#delete-apitag)
  - [GET /tag/exists](#get-apitagexists)
  - [GET /tag/page](#get-apitagpage)
  - [GET /tag/page2](#get-apitagpage2)
  - [Permissions on Tags](#permissions-on-tags)
- [Votes](#votes)
- [Items](#items)
  - [Item Membership in Tags](#item-membership-in-tags)
  - [Skipping Items](#skipping-items)
- [User Management](#user-management)
  - [Registration](#registration)
  - [Login](#login)
  - [Logout](#logout)
  - [Email Verification](#email-verification)
  - [Update Email](#update-email)
  - [Password Reset](#password-reset)
- [Users List](#users-list)
- [Integrations](#integrations)
  - [Spotify](#spotify-integration)
  - [YouTube](#youtube-integration)
  - [Linear](#linear-integration)
  - [Reddit](#reddit-integration)
  - [Twitter (X)](#twitter-integration)
- [Comments](#comments)
- [User Groups](#user-groups)
- [Visualization](#visualization)
- [Error Handling](#error-handling)

---

## General Conventions

- **All endpoints** typically return JSON responses unless specified otherwise.
- Some endpoints require a **logged-in session**. The session is tracked via an HTTP cookie. If you see `401` responses, that usually means you're not logged in.
- Parameters or request bodies are described for each endpoint.
- Many endpoints require or accept integer IDs for resources (e.g., `tag_id`, `item_id`).

---

## Authentication & Sessions

- Sorter uses **server-side sessions** (Ring session).
- Once you log in using `POST /api/login`, a session cookie is set in your browser.
- On subsequent requests, that session is used to identify the user.

---

## Health Check

### **GET** `/api/health`

**Description**: Simple health check endpoint.

| Requirement      | Details                                   |
| ---------------- | ----------------------------------------- |
| **Auth**         | No authentication required.               |
| **Query Params** | None.                                     |
| **Request Body** | None.                                     |
| **Response**     | **200 OK** with a plain text `"OK"` body. |

---

## Feed & Frontpage

### **GET** `/api/feed`

**Description**: Get a feed from an external aggregator (the Rust service at port 8081).

| Requirement      | Details                                                           |
| ---------------- | ----------------------------------------------------------------- |
| **Auth**         | No authentication required.                                       |
| **Query Params** | - **tag\_id** (optional): the ID of the tag to fetch a feed from. |
| **Request Body** | None                                                              |
| **Response**     | **200** with JSON feed data.                                      |

---

### **GET** `/api/frontpage`

**Description**: Retrieves a "frontpage" feed showing items, votes, and comments for a given day.

| Requirement      | Details                                                                           |
| ---------------- | --------------------------------------------------------------------------------- |
| **Auth**         | No authentication required (public feed).                                         |
| **Query Params** | - **day** (string/integer): which day offset (e.g. `0` = today, `1` = yesterday). |
| **Response**     | **200** with JSON containing votes, items, comments.                              |

---

## Hierarchy

### **GET** `/api/hierarchy`

**Description**: Returns a hierarchy data structure from the Rust aggregator (port 8081). Possibly used for advanced navigation or data structure in the UI.

| Requirement      | Details                 |
| ---------------- | ----------------------- |
| **Auth**         | None.                   |
| **Query Params** | None.                   |
| **Response**     | **200** with JSON body. |

---

## Leaderboard

### **GET** `/api/leaderboard`

**Description**: Returns aggregated voting statistics by user.

| Requirement      | Details                                                      |
| ---------------- | ------------------------------------------------------------ |
| **Auth**         | None                                                         |
| **Query Params** | None                                                         |
| **Response**     | **200** with JSON array listing users and their vote counts. |

---

## Tag Management

### **GET** `/api/tag`

**Description**: Lists tags the user has access to, separated into categories: public, private, unlisted, etc.

| Requirement          | Details                                                                              |
| -------------------- | ------------------------------------------------------------------------------------ |
| **Auth**             | Session optional. If the user is logged in, additional private tags may be returned. |
| **Query Params**     | None                                                                                 |
| **Response**         | **200** with JSON: <br/>{<br/>"public": \[...],<br/>"private": \[...],<br/>"unlisted": \[...],<br/>"namespaces": \[...]<br/>} |




---

### **POST** `/api/tag`
Creates (or updates) a tag. If `:tag_id` is provided, updates an existing tag. Otherwise, creates a new tag.

| Requirement        | Details                                                                               |
|--------------------|---------------------------------------------------------------------------------------|
| **Auth**           | **Must be logged in** (401 if not).                                                   |
| **Request Body**   | JSON with the following fields:<br/> - **tag_id** (int, optional): if present, update the tag.<br/> - **title** (string): the title of the tag.<br/> - **slug** (optional, automatically generated if omitted).<br/> - Additional fields (e.g. `description`, `domain_pk_namespace`, `domain_pk`, `unlisted`, `nsfw`, etc.) |
| **Response**       | **200** with JSON object of the newly created or updated tag.                         |
| **Rate Limiting**  | Rate-limited to about 1 request / minute.                                            |

**If updating**: The backend checks that you **own** the tag. Otherwise, a 403 error is thrown.

---

### **DELETE** `/api/tag`
Deletes an existing tag.

| Requirement        | Details                                                                      |
|--------------------|------------------------------------------------------------------------------|
| **Auth**           | Must be logged in **and** must own the tag (401 or 403 if not).               |
| **Query Params**   | - **id** (int): The tag ID to delete.                                         |
| **Response**       | **200** with `{"deleted": true}`.                                             |

---

### **GET** `/api/tag/exists`
Checks whether a given title and namespace would yield a conflicting slug in the database.

| Requirement  | Details                                                                       |
|--------------|-------------------------------------------------------------------------------|
| **Auth**     | None.                                                                         |
| **Query Params** | - **title** (string, required). <br/> - **ns** (string, optional, for namespace). |
| **Response** | **200** with JSON: ```{"slug": "...", "exists": true/false}```                |

---

### **GET** `/api/tag/page`
Proxies a request to the Rust aggregator endpoint `/api/tag/page`. Returns detailed page info about a tag, including sorted items, based on query parameters.

| Requirement    | Details                                               |
|----------------|-------------------------------------------------------|
| **Auth**       | Not strictly required for public tags. If the tag is private, you must have the correct session to see it. |
| **Query Params** | Example keys might include: `tag_id` (int), `user_name` (string, optional). |
| **Response**   | **200** with JSON containing tag info and sorted items. |

---

### **GET** `/api/tag/page2`
Like `/api/tag/page`, but calls a slightly different aggregator route `/api/tag/page2`. Returns another variation of the tag’s data.

| Requirement    | Details                                       |
|----------------|-----------------------------------------------|
| **Auth**       | Not strictly required for public tags.        |
| **Query Params** | Usually `tag_id`, `user_name`, etc.        |
| **Response**   | **200** with JSON.                            |

---

### Permissions on Tags

#### **GET** `/api/tag/permissions`
Returns the current list of permission records (capability vs user_id) for a given tag.

| Requirement  | Details                                                   |
|--------------|-----------------------------------------------------------|
| **Auth**     | Must be logged in **and** you must own the tag.           |
| **Query Params** | `tag_id` (int).                                       |
| **Response** | **200** with JSON array of permission objects.            |

---

#### **POST** `/api/tag/permissions`
Sets or updates the permissions for a tag. This overwrites or upserts the capabilities.

| Requirement      | Details                                                                 |
|------------------|-------------------------------------------------------------------------|
| **Auth**         | Must be logged in **and** own the tag.                                  |
| **Rate Limit**   | ~1 request/minute.                                                      |
| **Request Body** | JSON with fields: <br/> - **tag_id** (int)<br/> - **perms** (map): e.g.  ```{"vote": "all", "view": "all", "add": "none"}```. |
| **Response**     | **200** with updated permission rows.                                   |

---

## Votes

### **POST** `/api/vote`
Records or updates a vote comparing two items. The **left_item_id**, **right_item_id**, and **magnitude** are used to represent user preference.

| Requirement        | Details                                                                      |
|--------------------|------------------------------------------------------------------------------|
| **Auth**           | Must be logged in. 401 if not.                                                |
| **Rate Limit**     | ~1 request/second.                                                            |
| **Request Body**   | JSON fields include: <br/>- **left_item_id** (int) <br/>- **right_item_id** (int) <br/>- **magnitude** (int, 0 to 100) <br/>- **tag_id** (int) (optional, helps check permissions) <br/>- **attribute** (object): either existing or newly created if using placeholder like `{"id": -1, "title": "someTitle"}`. |
| **Response**       | **200** with `{"ok": true}`.                                                  |
| **Behavior**       | If there's an existing vote by the same user for these two items, it updates that vote; otherwise, it inserts a new vote. |

---

### **DELETE** `/api/vote`
Deletes a vote by ID.

| Requirement      | Details                                                       |
|------------------|---------------------------------------------------------------|
| **Auth**         | Must be the **owner** of that vote (the same `user_name`).    |
| **Request Body** | JSON with `{"vote_id": 123}`.                                 |
| **Response**     | **200** with `{"ok": true}`                                   |

---

## Items

### **POST** `/api/item`
Creates or updates an item (represents some entity to be sorted/ranked).

| Requirement      | Details                                                                              |
|------------------|--------------------------------------------------------------------------------------|
| **Auth**         | Must be logged in.                                                                    |
| **Rate Limit**   | ~1 request/second.                                                                    |
| **Request Body** | JSON with fields like: <br/> - **id** (int) => if present, updates existing item. <br/> - **title** (string) <br/> - **url** (string) <br/> - **tag_id** (int, optional) => item is also inserted into that tag. <br/> - Optional: `discord_channel_id`, `discord_server_id`. |
| **Response**     | **200** with JSON of the newly created/updated item.                                  |
| **Behavior**     | If `id` is provided, user must be the owner of that item. Otherwise, it creates a new item. |

---

## Item Membership in Tags

### **GET** `/api/item/membership`
Retrieves membership information for a given `item_id` across tags.

| Requirement    | Details                                                                |
|----------------|------------------------------------------------------------------------|
| **Auth**       | Not strictly required (though some private data might not show).       |
| **Query Params** | - **item_id** (int)                                                 |
| **Response**   | **200** with JSON: `{"membership": [...], "skips": [...] }`.           |
| **Behavior**   | Returns tags that the item belongs to, plus any skip info for the current user. |

---

### **POST** `/api/item/membership`
Adds an item to a tag.

| Requirement      | Details                                                                        |
|------------------|--------------------------------------------------------------------------------|
| **Auth**         | Must have "add" permission on the target tag. Otherwise 401.                   |
| **Request Body** | `{"tag_id": 12, "item_id": 123, "discord_channel_id": "...", "discord_server_id": "..."}` (optional fields). |
| **Response**     | **200** => `{"ok": true}`                                                      |

---

### **DELETE** `/api/item/membership`
Removes an item from a tag.

| Requirement      | Details                                                                                       |
|------------------|-----------------------------------------------------------------------------------------------|
| **Auth**         | Must be **owner** of the item.                                                                |
| **Request Body** | `{"item_id": 123, "tag_id": 12}`                                                              |
| **Response**     | **200** => `{"ok": true}`                                                                     |

---

## Skipping Items

### **POST** `/api/item/skip`
Marks an item as *skipped* for the current user.

| Requirement      | Details                          |
|------------------|----------------------------------|
| **Auth**         | Must be logged in (401 if not).  |
| **Request Body** | `{"item_id": 123}`               |
| **Response**     | **200** => `{"ok": true}`        |

---

### **DELETE** `/api/item/skip`
Unskips an item for the current user.

| Requirement      | Details                          |
|------------------|----------------------------------|
| **Auth**         | Must be logged in (401 if not).  |
| **Request Body** | `{"item_id": 123}`               |
| **Response**     | **200** => `{"ok": true}`        |

---

## User Management

### Registration

#### **POST** `/api/register`
Creates a user account.

| Requirement      | Details                                                                   |
|------------------|---------------------------------------------------------------------------|
| **Auth**         | Not required.                                                             |
| **Request Body** | `{"user_name": "desiredUsername", "email": "user@example.com", "password": "secret"}` |
| **Response**     | **200** => `"registration successful. please check your email..."`        |
| **Behavior**     | Creates user in DB, sets `email_verified = false`. Sends an email verification link if configured. |

---

### Login

#### **POST** `/api/login`
Logs in a user by username or email + password.

| Requirement      | Details                                                                                        |
|------------------|------------------------------------------------------------------------------------------------|
| **Auth**         | None (this is how you obtain a session).                                                      |
| **Request Body** | `{"user_name": "yourUsernameOrEmail", "password": "secret"}`                                  |
| **Response**     | - **200** => `"logged in"` if valid credentials and email is verified <br/> - **401** => `"invalid username/email or password"` <br/> - **403** => `"please verify your email"` or `"please set your email address"` if needed. |
| **Behavior**     | If successful, sets a session cookie.                                                          |

---

#### **GET** `/api/login`
Checks current session.

| Requirement    | Details                                              |
|----------------|------------------------------------------------------|
| **Auth**       | Not strictly required.                               |
| **Response**   | **200** with JSON containing your session, e.g. `{"user_name": "someName"}` or `{}` if not logged in. |

---

### Logout

#### **POST** `/api/logout`
Clears the current session.

| Requirement    | Details                    |
|----------------|----------------------------|
| **Auth**       | Must be logged in.        |
| **Response**   | **200** => `"ok"`, session cleared. |

---

## Email Verification

### **POST** `/api/send-confirmation`
Resends a verification email if the user’s email is unverified.

| Requirement      | Must be logged in or supply valid credentials. |
|------------------|-----------------------------------------------|
| **Request Body** | `{"email": "yourEmail@example.com", "password": "secret"}` |
| **Response**     | **200** => `"verification email sent"` or errors. |
| **Rate Limit**   | Approximately 3 requests per 5 minutes.       |

---

### **GET** `/api/verify`
Handles the verification link from an email.

| Requirement  | None (public link).                     |
|--------------|-----------------------------------------|
| **Query Params** | - **token** (string, required).    |
| **Response** | **200** => "email verified successfully", or **400** => "invalid or expired verification token". |

---

## Update Email

#### **POST** `/api/update-email`
Updates the user’s email and sets `email_verified = false`, then sends a new verification email.

| Requirement    | Must be logged in.                                   |
|----------------|------------------------------------------------------|
| **Request Body** | `{"user_name": "theCurrentUser", "email": "new@example.com"}` |
| **Response**   | **200** => `"email updated. please check your inbox..."`. |
| **Rate Limit** | 3 requests per 5 minutes.                            |

---

## Password Reset

### **POST** `/api/forgot-password`
Sends a password-reset email (if the email is known).  

| Requirement    | No authentication.                                               |
|----------------|------------------------------------------------------------------|
| **Request Body** | `{"email": "someEmail@example.com"}`.                         |
| **Response**   | **200** => always returns a success message (for security).      |
| **Rate Limit** | 3 requests per 5 minutes.                                        |

---

### **POST** `/api/reset-password`
Resets the password using a valid reset token.

| Requirement      | No authentication.                                               |
|------------------|------------------------------------------------------------------|
| **Request Body** | `{"token": "resetToken", "password": "newSecretPw"}`            |
| **Response**     | **200** => `"password has been reset successfully"` or **400** => `"invalid or expired reset token"`. |

---

## Users List

### **GET** `/api/users`
Lists all users in the system, or partial user info. (Primarily for debugging or admin usage.)

| Requirement    | Currently no auth required in the code (but subject to change). |
|----------------|-----------------------------------------------------------------|
| **Response**   | 200 => array of user records with minimal fields like `{"user_name": "...", "owner": ...}`. |

---

## Integrations

There is a central route `/api/integrations/status` that returns whether certain integrations (e.g. Spotify, YouTube) are connected for the current user. It requires a logged-in user.

### **GET** `/api/integrations/status`
Returns a JSON with status flags. Example:
```json
{
  "spotify": false,
  "youtube": false
}
````

| Requirement | Must be logged in.                              |
| ----------- | ----------------------------------------------- |
| Response    | **200** => `{"spotify": bool, "youtube": bool}` |

---

## Spotify Integration

All Spotify OAuth endpoints are grouped under `/api/spotify`. This uses standard OAuth2 flows, requiring client ID/secret in environment variables.

**Key routes**:

- **GET** `/api/spotify/auth`\
  Redirects user to Spotify’s OAuth authorization page.\
  Query param: `redirect` (optional) => after success, user is brought back there.

- **GET** `/api/spotify/callback`\
  Spotify OAuth callback. Exchange `code` for tokens, link them to the logged-in user.

- **GET** `/api/spotify/status`\
  Returns `{"connected": boolean}` if the user’s Spotify account is connected.

- **POST** `/api/spotify/disconnect`\
  Removes the Spotify tokens from the current user’s account, effectively disconnecting it.

- **GET** `/api/spotify/search`\
  Requires a query param `q`. Performs a Spotify search for albums, artists, and tracks.\
  Response example:
  ```json
  {
    "spotify.search-results": {
      "spotify.artist/artists": [...],
      "spotify.album/albums": [...],
      "spotify.track/tracks": [...]
    }
  }
  ```

- **POST** `/api/spotify/resolve`\
  Body example: `{"domain_pk": "1234ABCD", "domain_pk_namespace": "spotify.track", "name": "Song Title"}`.\
  This will create or retrieve the relevant items/tags in the local DB.

See [app.spotify](#) for more details in the code.

---

## YouTube Integration

All YouTube OAuth endpoints are grouped under `/api/youtube`.

- **GET** `/api/youtube/callback`\
  Exchanges `code` param for tokens.
- **POST** `/api/youtube/playlist`\
  Example usage to track your liked videos in a specialized tag.

YouTube integration is incomplete/experimental. Typically used to retrieve liked videos and add them to a tag.

---

## Linear Integration

Endpoints under `/api/linear`:

- **GET** `/api/linear/callback`\
  OAuth callback for Linear.
- **GET** `/api/linear/views`\
  Retrieve accessible Linear projects for the logged-in user.
- **POST** `/api/linear/views`\
  Body example: `{"id": "LinearProjectId"}` => attempts to sync that project’s issues into a sorter tag.

---

## Reddit Integration

Endpoints under `/api/reddit`.

- **POST** `/api/reddit/make-sub`\
  Body: `{"subreddit": "funny"}` => Creates a tag for that subreddit.
- **POST** `/api/reddit/refresh`\
  Body: `{"tagid": <tag-id>}` => Refreshes from the subreddit’s /hot feed, adding them as items.

---

## Twitter Integration

Endpoints under `/api/twitter`.

- **GET** `/api/twitter/callback`\
  OAuth callback.
- **GET** `/api/twitter/liked`\
  Fetch liked tweets of the logged-in user. Returns them in JSON.
- **GET** `/api/twitter/page`\
  Example endpoint to return or create monthly-based “x-<month>-<year>” tags.
- **POST** `/api/twitter/import`\
  Body: `{"tweets": [{...}, ...]}` => Import tweets as items.

---

## Comments

All comment-related endpoints are under `/api/comments`.

- **GET** `/api/comments`\
  Query param `coord`: e.g. `"item:123"`. Returns comments for that item.
- **POST** `/api/comments`\
  Body: `{"coord": "item:123", "parent_id": null, "body": "hello"}` => Creates a new comment.
- **DELETE** `/api/comments`\
  Query param or body param `id`: deletes a comment (must own it).

---

## User Groups

All user group endpoints are under `/api/user_group`.

- **GET** `/api/user_group`\
  Returns groups you own.

- **POST** `/api/user_group`\
  Body example:
  ```json
  {
    "group_name": "someGroupName",
    "users": ["alice", "bob"]
  }
  ```
  Creates or updates a group with that name. Must be logged in.

- **DELETE** `/api/user_group`\
  Body: `{"group_name": "..."}`
  Must be the owner to delete.

- **GET** `/api/user_group/me`\
  Lists groups **you** are a member of.

---

## Visualization

Endpoints under `/api/viz`.

### **GET** `/api/viz/items`

Returns all items in the database (or limited set) for a visualization.

| Requirement      | No special auth, but rate-limited. |
| ---------------- | ---------------------------------- |
| **Query Params** | - **limit** (int, optional).       |
| **Response**     | 200 => list of items.              |

### **GET** `/api/viz/votes`

Returns all votes (or a limited set) for a visualization.

| Requirement      | No special auth, but rate-limited.               |
| ---------------- | ------------------------------------------------ |
| **Query Params** | - **limit** (int, optional)                      |
| **Response**     | 200 => list of votes with magnitude, owner, etc. |

---

## Error Handling

In general, if an endpoint fails due to a user-related condition (e.g., invalid ID, missing permission, missing session), the response:

- **401 Unauthorized**: Typically means "not logged in" or no session.
- **403 Forbidden**: Typically means "you are logged in, but do not own or lack permission."
- **400 Bad Request**: Malformed input or parameters.
- **500 Internal Server Error**: Unexpected error or server exception.

When errors occur, the response body is typically JSON with a structure like:

```json
{
  "message": "Description of the error"
}
```

and possibly additional data in `ex-data`.

---

## Conclusion

This API supports adding and managing tags, items, votes, user groups, and integrates with external services (Spotify, YouTube, etc.). For further details, refer to the Clojure code in the `app` namespace files. Remember that for read/write endpoints, **session-based authentication** is crucial. Ensure you handle cookies properly in your requests.