package expense_service.client;

import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Captures the caller's Authorization header so inter-service calls run with
 * the SAME user identity — the downstream service's own JWT filter and
 * ownership checks still apply. Capture happens on the request thread; when
 * work goes async (CompletableFuture) the value must be captured BEFORE
 * switching threads and passed explicitly.
 */
public final class BearerForward {

    private BearerForward() { }

    public static String currentAuthorization() {
        var attrs = RequestContextHolder.getRequestAttributes();
        if (attrs instanceof ServletRequestAttributes sra) {
            return sra.getRequest().getHeader("Authorization");
        }
        return null;
    }
}
