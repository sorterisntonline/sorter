// API functions for the Folksonomy system

const STATIC_KEY = "STATIC_TEST_KEY_FOR_ADMIN_USER_123";

// --- API Fetching Functions for Folksonomy ---

// Get folksonomy system information
export const fetchFolksonomyInfoFn = async () => {
    console.log('Fetching folksonomy info from: /api/folksonomy/info');
    const response = await fetch('/api/folksonomy/info');

    if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`HTTP error! status: ${response.status}. ${errorText}`);
        error.status = response.status;
        throw error;
    }

    const data = await response.json();
    if (data.error) {
        throw new Error(data.error);
    }

    return data;
};

// Get folksonomy database statistics  
export const fetchFolksonomyStatsFn = async () => {
    console.log('Fetching folksonomy stats from: /api/folksonomy/stats');
    const response = await fetch('/api/folksonomy/stats');

    if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`HTTP error! status: ${response.status}. ${errorText}`);
        error.status = response.status;
        throw error;
    }

    const data = await response.json();
    if (data.error) {
        throw new Error(data.error);
    }

    return data;
};

// Create example scenarios (requires authentication)
export const createExampleScenarioFn = async (scenario) => {
    console.log(`Creating example scenario: ${scenario}`);
    
    const response = await fetch('/api/folksonomy/examples', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${STATIC_KEY}`, // Use static key for demo
        },
        body: JSON.stringify({ scenario }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`HTTP error! status: ${response.status}. ${errorText}`);
        error.status = response.status;
        throw error;
    }

    const data = await response.json();
    if (data.error) {
        throw new Error(data.error);
    }

    return data;
};

// Future functions for the full folksonomy API:

// Get tag collections (when full API is implemented)
export const fetchTagCollectionsFn = async ({ queryKey }) => {
    const [_key, params] = queryKey;
    
    let apiUrl = '/api/folksonomy/collections';
    const urlParams = new URLSearchParams();
    
    if (params?.include_claims) urlParams.append('include_claims', 'true');
    if (params?.include_memberships) urlParams.append('include_memberships', 'true');
    if (params?.include_votes) urlParams.append('include_votes', 'true');
    
    const queryString = urlParams.toString();
    if (queryString) {
        apiUrl += `?${queryString}`;
    }

    console.log(`Fetching tag collections from: ${apiUrl}`);
    
    const response = await fetch(apiUrl);
    if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`HTTP error! status: ${response.status}. ${errorText}`);
        error.status = response.status;
        throw error;
    }

    const data = await response.json();
    if (data.error) {
        throw new Error(data.error);
    }

    return data;
};

// Get slug resolution with history
export const fetchSlugResolutionFn = async ({ queryKey }) => {
    const [_key, slug, params] = queryKey;
    
    let apiUrl = `/api/folksonomy/slugs/${encodeURIComponent(slug)}`;
    const urlParams = new URLSearchParams();
    
    if (params?.at_time) urlParams.append('at_time', params.at_time);
    if (params?.include_metadata) urlParams.append('include_metadata', 'true');
    if (params?.include_disputed) urlParams.append('include_disputed', 'true');
    
    const queryString = urlParams.toString();
    if (queryString) {
        apiUrl += `?${queryString}`;
    }

    console.log(`Fetching slug resolution from: ${apiUrl}`);
    
    const response = await fetch(apiUrl);
    if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`HTTP error! status: ${response.status}. ${errorText}`);
        error.status = response.status;
        throw error;
    }

    const data = await response.json();
    if (data.error) {
        throw new Error(data.error);
    }

    return data;
};

// Create a new tag collection
export const createTagCollectionFn = async ({ name, description, metadata }) => {
    console.log('Creating tag collection:', { name, description });
    
    const response = await fetch('/api/folksonomy/collections', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${STATIC_KEY}`,
        },
        body: JSON.stringify({ name, description, metadata }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`HTTP error! status: ${response.status}. ${errorText}`);
        error.status = response.status;
        throw error;
    }

    const data = await response.json();
    if (data.error) {
        throw new Error(data.error);
    }

    return data;
};

// Create a tag claim
export const createTagClaimFn = async ({ collection_id, slug, min_voter_reputation, requires_approval, metadata }) => {
    console.log('Creating tag claim:', { collection_id, slug });
    
    const response = await fetch('/api/folksonomy/claims', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${STATIC_KEY}`,
        },
        body: JSON.stringify({ 
            collection_id, 
            slug, 
            min_voter_reputation, 
            requires_approval, 
            metadata 
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`HTTP error! status: ${response.status}. ${errorText}`);
        error.status = response.status;
        throw error;
    }

    const data = await response.json();
    if (data.error) {
        throw new Error(data.error);
    }

    return data;
};

// Add entity to collection
export const addCollectionMembershipFn = async ({ 
    collection_id, 
    entity_pk_namespace, 
    entity_pk, 
    justification, 
    confidence_score, 
    metadata 
}) => {
    console.log('Adding collection membership:', { collection_id, entity_pk_namespace, entity_pk });
    
    const response = await fetch('/api/folksonomy/memberships', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${STATIC_KEY}`,
        },
        body: JSON.stringify({ 
            collection_id, 
            entity_pk_namespace, 
            entity_pk, 
            justification, 
            confidence_score, 
            metadata 
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`HTTP error! status: ${response.status}. ${errorText}`);
        error.status = response.status;
        throw error;
    }

    const data = await response.json();
    if (data.error) {
        throw new Error(data.error);
    }

    return data;
};

// Vote between tag collections
export const createTagCollectionVoteFn = async ({ 
    slug, 
    left_collection_id, 
    right_collection_id, 
    magnitude, 
    attribute_id, 
    reason, 
    metadata 
}) => {
    console.log('Creating tag collection vote:', { 
        slug, 
        left_collection_id, 
        right_collection_id, 
        magnitude 
    });
    
    const response = await fetch('/api/folksonomy/votes', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${STATIC_KEY}`,
        },
        body: JSON.stringify({ 
            slug, 
            left_collection_id, 
            right_collection_id, 
            magnitude, 
            attribute_id: attribute_id || 1, // Default to 'like' attribute
            reason, 
            metadata 
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`HTTP error! status: ${response.status}. ${errorText}`);
        error.status = response.status;
        throw error;
    }

    const data = await response.json();
    if (data.error) {
        throw new Error(data.error);
    }

    return data;
};