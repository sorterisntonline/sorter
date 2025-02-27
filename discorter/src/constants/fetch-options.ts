export const FetchOptions = {
    headers: {
        'User-Agent': 'discorter/1.0',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SORTER_API_TOKEN || ''}`,
    },
    timeout: 10000,
}; 