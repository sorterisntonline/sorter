export class EnvUtils {
    public static getSorterHost(): string {
        const environment = process.env.ENVIRONMENT?.toLowerCase();
        if (environment === 'production') {
            return 'https://sorter.social';
        } else if (environment === 'staging') {
            return 'https://staging.sorter.social';
        } else {
            return 'http://localhost:3000';
        }
    }

    public static getSorterApiUrl(): string {
        return `${process.env.SORTER_API_URL || `${this.getSorterHost()}/api`}`;
    }

    public static getTagUrl(id: string, slug: string): string {
        return `${this.getSorterHost()}/${id}/${slug}`;
    }
} 