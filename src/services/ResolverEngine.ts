import { syncPendingSubmissions } from './offlineService';
import NetInfo from '@react-native-community/netinfo';
import createLogger from '../utils/logger';

const log = createLogger('Resolver');

export interface SyncResult {
    success: boolean;
    syncedCount: number;
    failedCount: number;
    errors: string[];
}

export class ResolverEngine {
    
    /**
     * Pushes local pending attendance logs to Supabase using offlineService storage.
     * Uses offlineService.syncPendingSubmissions logic which correctly handles session creation.
     */
    static async syncPendingAttendance(): Promise<SyncResult> {
        // 1. Check Network
        const netState = await NetInfo.fetch();
        if (!netState.isConnected) {
            return { 
                success: false, 
                syncedCount: 0, 
                failedCount: 0, 
                errors: ['No internet connection'] 
            };
        }

        try {
            // 2. Delegate to offlineService which handles session + logs correctly
            const { synced, failed } = await syncPendingSubmissions();

            return {
                success: failed === 0,
                syncedCount: synced,
                failedCount: failed,
                errors: failed > 0 ? ['Some batches failed. Check console logs.'] : []
            };

        } catch (err: any) {
            log.error('Fatal Sync Error:', err);
            return {
                success: false,
                syncedCount: 0,
                failedCount: 0, 
                errors: [err.message]
            };
        }
    }
}
