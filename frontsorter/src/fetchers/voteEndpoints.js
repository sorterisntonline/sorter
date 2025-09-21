const STATIC_KEY = "STATIC_TEST_KEY_FOR_ADMIN_USER_123";

// --- API Fetching Function for a PAIR ---
export const fetchPairFn = async ({ queryKey }) => {
    // Destructure parameters from the queryKey
    const [_key, type, param1, param2, param3, param4, param5, param6] = queryKey; 
    // e.g., ['pair', 'specific', ns, pk, ns, pk] or ['pair', 'children', ns, pk, left_pin_ns, left_pin_pk]

    let apiUrl = '/api/pair';
    const params = new URLSearchParams();

    if (type === 'specific' && param1 && param2 && param3 && param4) {
        params.append('left_ns', param1);
        params.append('left_pk', param2);
        params.append('right_ns', param3);
        params.append('right_pk', param4);
    } else if (type === 'children' && param1 && param2) {
        params.append('ns', param1);
        params.append('pk', param2);
        
        // Add pinning parameters if provided
        if (param3 && param4) {
            params.append('left_pin_ns', param3);
            params.append('left_pin_pk', param4);
        }
    }
    // If type is 'default' or params are missing for specific/children,
    // we send no query parameters, letting the backend provide a default pair.

    const queryString = params.toString();
    if (queryString) {
        apiUrl += `?${queryString}`;
    }

    console.log(`Fetching pair (${type}) from:`, apiUrl);
    const response = await fetch(apiUrl);

    if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`HTTP error! status: ${response.status} for ${apiUrl}. ${errorText}`);
        error.status = response.status; // Attach status code
        throw error;
    }
    const data = await response.json();
    if (data.error) {
        throw new Error(data.error);
    }
    if (!data.left_entity || !data.right_entity) {
        console.warn("API response missing left_entity or right_entity:", data);
        throw new Error("Incomplete pair data received from API.");
    }
    return data;
};

// --- API Function to Submit a Vote (Append-Only) ---
export const submitVoteFn = async ({
    left_ns, left_pk, right_ns, right_pk, attribute_id, magnitude
    // voter_user_id is no longer needed, obtained from auth token
}) => {

    // TODO: Allow selecting attribute_id (defaulting to 'like' = 1)
    // NOTE: The 'like' attribute ID is 1 based on the migration, not 0.
    const attributeIdToUse = attribute_id !== undefined ? attribute_id : 1; // Default to 1 for 'like'

    const createUrl = '/api/vote'; // Only POST endpoint is used now

    const createPayload = {
        left_entity_ns: left_ns,
        left_entity_pk: left_pk,
        right_entity_ns: right_ns,
        right_entity_pk: right_pk,
        attribute_id: attributeIdToUse,
        magnitude: magnitude,
        // No voter_user_id here, backend gets it from auth
    };

    console.log("Submitting vote (POST):", createUrl, createPayload);

    const response = await fetch(createUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createPayload),
    });

    if (response.ok) {
        console.log("Vote created successfully");
        return await response.json(); // Return created vote data
    }

    // Handle specific errors like Conflict (409) or Bad Request (400)
    if (response.status === 409) {
        console.warn("Vote conflict detected.");
        // This might happen if the exact same vote (same pair, user, attr, timestamp) was somehow submitted twice,
        // or if the PK doesn't include timestamp and a vote already exists for the pair/user/attr.
        throw new Error("Vote conflict. It might already exist.");
    }
    if (response.status === 400) {
        const errorText = await response.text();
        console.error("Bad request (400):", errorText);
        throw new Error(`Invalid vote data: ${errorText}`);
    }

    // Handle other errors
    const errorText = await response.text();
    console.error(`Failed to submit vote. Status: ${response.status}. Body: ${errorText}`);
    const error = new Error(`Failed to submit vote. Status: ${response.status}.`);
    error.status = response.status;
    throw error;
};

export const addChildFn = async ({
    child_pk,
    child_ns,
    parent_pk,
    parent_ns
}) => {
    const url = "/api/entity_relationships"
    console.log(JSON.stringify({child_pk, child_ns, parent_pk, parent_ns}))
    const response = await fetch(url, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${STATIC_KEY}`,
        },
        body: JSON.stringify({child_pk, child_ns, parent_pk, parent_ns}),
    });

    if (response.ok) {
        console.log("relationship created successfully");
        return await response.json(); // Return created vote data
    } else {
        console.log("failure")
        return await response.text()
    }
}