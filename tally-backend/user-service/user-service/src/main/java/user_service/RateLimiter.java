package user_service;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Simple in-memory rate limiter (no Redis needed for sandbox).
 * Two usage patterns:
 * - allow(key, max, window): sliding-window counter for actions (e.g. transfers)
 * - recordFailure/isBlocked/reset: failed-attempt tracking (e.g. login)
 *
 * NOTE: in-memory means limits reset on server restart and are per-instance.
 * Swap for a Redis-backed implementation before scaling horizontally.
 */
@Component
public class RateLimiter {

    private static final class Window {
        long windowStart;
        int count;
    }

    private final Map<String, Window> windows = new ConcurrentHashMap<>();

    /** Counts this call; returns false when the limit for the window is exhausted. */
    public synchronized boolean allow(String key, int maxPerWindow, long windowMs) {
        long now = System.currentTimeMillis();
        Window w = windows.computeIfAbsent(key, k -> new Window());
        if (now - w.windowStart > windowMs) {
            w.windowStart = now;
            w.count = 0;
        }
        if (w.count >= maxPerWindow) {
            return false;
        }
        w.count++;
        return true;
    }

    /** Records a failed attempt (e.g. wrong password). */
    public synchronized void recordFailure(String key, long windowMs) {
        long now = System.currentTimeMillis();
        Window w = windows.computeIfAbsent(key, k -> new Window());
        if (now - w.windowStart > windowMs) {
            w.windowStart = now;
            w.count = 0;
        }
        w.count++;
    }

    /** True when the key has reached the failure limit within the window. */
    public synchronized boolean isBlocked(String key, int maxFailures, long windowMs) {
        Window w = windows.get(key);
        if (w == null) return false;
        if (System.currentTimeMillis() - w.windowStart > windowMs) {
            windows.remove(key);
            return false;
        }
        return w.count >= maxFailures;
    }

    /** Clears tracking for a key (e.g. after a successful login). */
    public void reset(String key) {
        windows.remove(key);
    }
}
