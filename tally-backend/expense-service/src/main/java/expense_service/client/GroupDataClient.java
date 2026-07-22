package expense_service.client;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * expense-service's ONLY access to group data: group-service's aggregate API
 * (replaces the former read-only JPA mappings of groups, group_members and
 * shared_expenses used by the monthly report and combined history).
 */
@Component
public class GroupDataClient {

    private final RestTemplate restTemplate;

    @Value("${services.group-url}")
    private String groupServiceUrl;

    public GroupDataClient(RestTemplate interServiceRestTemplate) {
        this.restTemplate = interServiceRestTemplate;
    }

    /**
     * GET /api/groups/user/{id}/shared-data with the caller's JWT forwarded.
     * Returns a list of group entries: {groupId, groupName,
     * members:[{userId,name}], expenses:[{id, amount, description, splitType,
     * splitRatios, participantIds, settled, createdAt, paidBy, paidByName}]}.
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> getUserSharedData(Long userId, String authorization) {
        HttpHeaders headers = new HttpHeaders();
        if (authorization != null) headers.set(HttpHeaders.AUTHORIZATION, authorization);
        try {
            Map<String, Object> body = restTemplate.exchange(
                    groupServiceUrl + "/api/groups/user/" + userId + "/shared-data",
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    new ParameterizedTypeReference<Map<String, Object>>() { }).getBody();
            Object groups = body != null ? body.get("groups") : null;
            return groups instanceof List ? (List<Map<String, Object>>) groups : new ArrayList<>();
        } catch (ResourceAccessException e) {
            throw new DownstreamUnavailableException(
                    "Group service is temporarily unavailable. Please try again shortly.", e);
        } catch (RestClientException e) {
            throw new DownstreamUnavailableException(
                    "Group service returned an unexpected error. Please try again shortly.", e);
        }
    }
}
