package api_gateway;

import org.springframework.boot.web.error.ErrorAttributeOptions;
import org.springframework.boot.web.reactive.error.DefaultErrorAttributes;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.server.ServerRequest;

import java.net.ConnectException;
import java.net.UnknownHostException;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeoutException;

/**
 * Every other Tally service returns errors as {"error": ..., "success": false}
 * via a Spring MVC @RestControllerAdvice — the gateway is reactive (WebFlux)
 * and has no controllers of its own to advise, so it falls back to Spring
 * Boot's default {"timestamp","path","status","error","message"} shape
 * instead. Since the gateway is the one thing every mobile request goes
 * through, that's exactly the shape mismatch a client parsing "success"/
 * "error" would hit first — most likely when a downstream service is
 * unreachable, which surfaces here as a proxy connection failure.
 *
 * Overriding this bean is the standard WebFlux hook for the JSON body
 * Spring's built-in error handler renders; it doesn't require reimplementing
 * routing or the handler chain itself.
 */
@Component
public class GatewayErrorAttributes extends DefaultErrorAttributes {

    @Override
    public Map<String, Object> getErrorAttributes(ServerRequest request, ErrorAttributeOptions options) {
        Map<String, Object> defaults = super.getErrorAttributes(request, options);
        Throwable error = getError(request);

        int status = defaults.get("status") instanceof Integer s ? s : 500;
        String message = defaults.get("message") instanceof String m && !m.isBlank()
                ? m : "An unexpected error occurred";

        if (isDownstreamUnavailable(error)) {
            status = 503;
            message = "A required service is temporarily unavailable. Please try again shortly.";
        }

        Map<String, Object> body = new HashMap<>();
        body.put("error", message);
        body.put("success", false);
        body.put("status", status);
        return body;
    }

    private boolean isDownstreamUnavailable(Throwable error) {
        Throwable cause = error;
        while (cause != null) {
            // ConnectException: refused/unreachable. UnknownHostException: DNS
            // resolution failure — what a stopped/crashed service's Docker or
            // Railway internal hostname actually surfaces as, not a connect
            // refusal. TimeoutException: the proxy request itself timed out.
            if (cause instanceof ConnectException
                    || cause instanceof UnknownHostException
                    || cause instanceof TimeoutException) {
                return true;
            }
            cause = cause.getCause();
        }
        return false;
    }
}
