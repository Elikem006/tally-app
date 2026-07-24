package auth_service.client;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * auth-service's only outbound call: asking group-service who shares a group
 * with a given user, to authorize POST /api/auth/users/lookup. The caller's
 * own JWT is forwarded (not a minted token) — group-service's JwtAuthFilter
 * enforces that the path userId matches that JWT's own userId, so this can
 * only ever be asked "who do I share a group with", never on someone else's
 * behalf.
 */
@Component
public class GroupServiceClient {

    private final RestTemplate restTemplate;

    @Value("${services.group-url}")
    private String groupServiceUrl;

    public GroupServiceClient(RestTemplate interServiceRestTemplate) {
        this.restTemplate = interServiceRestTemplate;
    }

    public Set<Long> getCoMemberIds(Long userId, String authorization) {
        HttpHeaders headers = new HttpHeaders();
        if (authorization != null) headers.set(HttpHeaders.AUTHORIZATION, authorization);

        try {
            List<Long> ids = restTemplate.exchange(
                    groupServiceUrl + "/api/groups/user/" + userId + "/co-members",
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    new ParameterizedTypeReference<List<Long>>() { }).getBody();
            return ids != null ? new HashSet<>(ids) : new HashSet<>();
        } catch (ResourceAccessException e) {
            throw new DownstreamUnavailableException(
                    "Group service is temporarily unavailable.", e);
        } catch (RestClientException e) {
            throw new DownstreamUnavailableException(
                    "Co-member lookup failed: " + e.getMessage(), e);
        }
    }
}
