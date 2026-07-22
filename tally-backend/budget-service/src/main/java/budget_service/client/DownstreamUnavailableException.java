package budget_service.client;

/**
 * A downstream Tally service could not be reached (connection refused,
 * timeout, or 5xx). Controllers translate this into a clean HTTP 503 JSON
 * response instead of a misleading 400 or an unhandled stack trace.
 */
public class DownstreamUnavailableException extends RuntimeException {
    public DownstreamUnavailableException(String message) { super(message); }
    public DownstreamUnavailableException(String message, Throwable cause) { super(message, cause); }
}
