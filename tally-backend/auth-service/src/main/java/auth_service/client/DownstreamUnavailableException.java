package auth_service.client;

/**
 * A downstream Tally service could not be reached (connection refused,
 * timeout, or 5xx). Callers translate this into a safe fallback rather than
 * an unhandled stack trace.
 */
public class DownstreamUnavailableException extends RuntimeException {
    public DownstreamUnavailableException(String message) { super(message); }
    public DownstreamUnavailableException(String message, Throwable cause) { super(message, cause); }
}
