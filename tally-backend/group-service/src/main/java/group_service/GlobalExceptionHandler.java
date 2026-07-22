package group_service;

import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.Map;
import java.util.logging.Logger;

/**
 * Global safety net: no endpoint may ever leak a raw Java stack trace to a
 * client. Controllers already catch their own business exceptions and return
 * clean JSON; this advice covers everything that slips through (malformed
 * JSON, wrong types in path params, unknown routes, concurrent-settle
 * conflicts, and any truly unexpected failure).
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = Logger.getLogger(GlobalExceptionHandler.class.getName());

    /** Unknown route → 404 with clean JSON instead of the whitelabel error page. */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<?> handleNotFound(NoResourceFoundException e) {
        return ResponseEntity.status(404)
                .body(Map.of("error", "The requested resource was not found", "success", false));
    }

    /** Wrong HTTP verb on a real route → 405. */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<?> handleMethodNotSupported(HttpRequestMethodNotSupportedException e) {
        return ResponseEntity.status(405)
                .body(Map.of("error", "That HTTP method is not supported on this endpoint", "success", false));
    }

    /** Malformed JSON body → 400. */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<?> handleUnreadable(HttpMessageNotReadableException e) {
        return ResponseEntity.badRequest()
                .body(Map.of("error", "Request body is missing or not valid JSON", "success", false));
    }

    /** Non-numeric id in a numeric path param (e.g. /api/expenses/abc) → 400. */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<?> handleTypeMismatch(MethodArgumentTypeMismatchException e) {
        return ResponseEntity.badRequest()
                .body(Map.of("error", "Invalid value for '" + e.getName() + "' in the request", "success", false));
    }

    /** Two users settled the same group at the same moment → 409. */
    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ResponseEntity<?> handleOptimisticLock(OptimisticLockingFailureException e) {
        return ResponseEntity.status(409)
                .body(Map.of("error", "Someone else updated this at the same time — please refresh and try again", "success", false));
    }

    /** Last resort — log the details server-side, return a friendly message. */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<?> handleUnexpected(Exception e) {
        log.severe("Unhandled exception: " + e.getClass().getSimpleName() + " — " + e.getMessage());
        return ResponseEntity.status(500)
                .body(Map.of("error", "Something went wrong on our side. Please try again.", "success", false));
    }
}
