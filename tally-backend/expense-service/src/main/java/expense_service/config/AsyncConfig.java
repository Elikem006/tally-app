package expense_service.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Backs MoMoController's fire-and-forget request-to-pay call: the actual
 * MTN sandbox round trip (with its own internal retries) runs off the
 * request thread, so /api/momo/pay returns as soon as a referenceId exists
 * rather than waiting on a third-party payment API. One virtual thread per
 * submitted task — cheap and appropriate for this I/O-bound, short-lived work.
 */
@Configuration
public class AsyncConfig {

    @Bean
    public ExecutorService momoExecutor() {
        return Executors.newVirtualThreadPerTaskExecutor();
    }
}
