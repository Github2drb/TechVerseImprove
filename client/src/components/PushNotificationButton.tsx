// client/src/components/PushNotificationButton.tsx
// Add this button to the dashboard so engineers can enable push notifications
//
// Usage in dashboard.tsx:
//   import { PushNotificationButton } from "@/components/PushNotificationButton";
//   <PushNotificationButton />    ← add near the top of the page

import { Bell, BellOff, Loader2 } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { usePushNotifications } from '@/hooks/usePushNotifications';

export function PushNotificationButton() {
  const { user } = useAuth();
  const engineerName = user?.name ?? user?.username ?? '';
  const { supported, subscribed, loading, error, subscribe, unsubscribe } = usePushNotifications(engineerName);

  if (!user || !supported) return null;

  if (subscribed) {
    return (
      <button onClick={unsubscribe} disabled={loading}
        title="Disable push notifications"
        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full
          bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20
          hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20 transition-colors">
        {loading
          ? <Loader2 className="h-3.5 w-3.5 animate-spin"/>
          : <Bell className="h-3.5 w-3.5"/>}
        Notifications on
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={subscribe} disabled={loading}
        title="Enable push notifications on this device"
        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full
          bg-muted text-muted-foreground border border-input
          hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors">
        {loading
          ? <Loader2 className="h-3.5 w-3.5 animate-spin"/>
          : <BellOff className="h-3.5 w-3.5"/>}
        Enable notifications
      </button>
      {error && <p className="text-[10px] text-red-500">{error}</p>}
    </div>
  );
}
