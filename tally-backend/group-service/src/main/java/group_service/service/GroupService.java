package group_service.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import group_service.JwtUtil;
import group_service.client.AuthClient;
import group_service.client.BearerForward;
import group_service.client.ExpenseServiceClient;
import group_service.model.Group;
import group_service.model.GroupMember;
import group_service.model.SharedExpense;
import group_service.repository.GroupMemberRepository;
import group_service.repository.GroupRepository;
import group_service.repository.SharedExpenseRepository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;

/**
 * MICROSERVICES CORRECTION: this service now touches ONLY its own tables
 * (groups, group_members, shared_expenses). Everything else goes through the
 * owning service's HTTP API:
 *   - user names/avatars  -> auth-service    POST /api/auth/users/lookup
 *   - settlement expenses -> expense-service POST /api/expenses
 *   - MoMo request-to-pay -> expense-service POST /api/momo/pay
 * The former read-only users mapping, the trimmed createExpense copy and the
 * duplicated MoMoService have all been removed.
 */
@Service
public class GroupService {

    @Autowired
    private GroupRepository groupRepository;

    @Autowired
    private GroupMemberRepository groupMemberRepository;

    @Autowired
    private SharedExpenseRepository sharedExpenseRepository;

    @Autowired
    private AuthClient authClient;

    @Autowired
    private ExpenseServiceClient expenseServiceClient;

    @Autowired
    private JwtUtil jwtUtil;

    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final BigDecimal ONE_HUNDRED = BigDecimal.valueOf(100);

    /**
     * Parse a splitRatios JSON string ({"1": 60, "2": 40}) into userId → percentage.
     * Throws with a user-readable message when the JSON is malformed.
     */
    private Map<Long, BigDecimal> parseSplitRatios(String splitRatios) {
        try {
            Map<String, Object> raw = objectMapper.readValue(
                    splitRatios, objectMapper.getTypeFactory()
                            .constructMapType(HashMap.class, String.class, Object.class));
            Map<Long, BigDecimal> ratios = new HashMap<>();
            for (Map.Entry<String, Object> e : raw.entrySet()) {
                ratios.put(Long.parseLong(e.getKey().trim()), new BigDecimal(String.valueOf(e.getValue())));
            }
            return ratios;
        } catch (Exception e) {
            throw new RuntimeException("splitRatios must be valid JSON mapping userId to percentage, e.g. {\"1\": 60, \"2\": 40}");
        }
    }

    /**
     * The userIds included in an expense's split. Uses the participant snapshot
     * taken at creation time when available, so members who joined the group
     * AFTER an expense was added are excluded from that expense. Legacy rows
     * (null snapshot) fall back to all current members.
     */
    private Set<Long> participantsOf(SharedExpense expense, List<GroupMember> members) {
        if (expense.getParticipantIds() != null && !expense.getParticipantIds().isBlank()) {
            Set<Long> ids = new HashSet<>();
            for (String s : expense.getParticipantIds().split(",")) {
                try {
                    ids.add(Long.parseLong(s.trim()));
                } catch (NumberFormatException ignored) {
                    // skip malformed token
                }
            }
            if (!ids.isEmpty()) return ids;
        }
        Set<Long> ids = new HashSet<>();
        for (GroupMember m : members) ids.add(m.getUserId());
        return ids;
    }

    /**
     * A member's share of an expense: zero if they were not a participant when
     * it was created; percentage-based for CUSTOM splits; otherwise an equal
     * share among the PARTICIPANTS (not the current member count). Falls back
     * to equal split if a stored ratio string can no longer be parsed.
     */
    private BigDecimal shareFor(SharedExpense expense, Long memberId, List<GroupMember> members) {
        Set<Long> participants = participantsOf(expense, members);
        if (!participants.contains(memberId)) return BigDecimal.ZERO;

        if ("CUSTOM".equals(expense.getSplitType()) && expense.getSplitRatios() != null) {
            try {
                Map<Long, BigDecimal> ratios = parseSplitRatios(expense.getSplitRatios());
                BigDecimal pct = ratios.getOrDefault(memberId, BigDecimal.ZERO);
                return expense.getAmount().multiply(pct)
                        .divide(ONE_HUNDRED, 2, RoundingMode.HALF_UP);
            } catch (Exception ignored) {
                // fall through to equal split
            }
        }
        return expense.getAmount()
                .divide(BigDecimal.valueOf(Math.max(participants.size(), 1)), 2, RoundingMode.HALF_UP);
    }

    // ── user display data via auth-service (batch, one HTTP call per request) ──

    private Map<String, Map<String, Object>> lookupUsers(Collection<Long> userIds) {
        return authClient.lookupUsers(userIds, BearerForward.currentAuthorization());
    }

    private static Map<String, Object> userEntry(Map<String, Map<String, Object>> lookup, Long userId) {
        return lookup != null ? lookup.get(String.valueOf(userId)) : null;
    }

    private static String nameOf(Map<String, Map<String, Object>> lookup, Long userId) {
        Map<String, Object> u = userEntry(lookup, userId);
        Object name = u != null ? u.get("name") : null;
        return name != null ? String.valueOf(name) : "User #" + userId;
    }

    private static Object avatarOf(Map<String, Map<String, Object>> lookup, Long userId, String field) {
        Map<String, Object> u = userEntry(lookup, userId);
        return u != null ? u.get(field) : null;
    }

    // Create a new group
    public Group createGroup(String name, Long createdBy) {
        Group group = new Group();
        group.setName(name);
        group.setCreatedBy(createdBy);
        group = groupRepository.save(group);

        GroupMember member = new GroupMember();
        member.setGroupId(group.getId());
        member.setUserId(createdBy);
        groupMemberRepository.save(member);

        return group;
    }

    /**
     * Throws unless requestingUserId is a member (or the creator) of groupId.
     * Callers must pass the JWT-authenticated userId here, never a
     * client-suppliable field — this is the authorization gate for every
     * group-scoped read/write below, not just a display-personalization hint.
     */
    private void requireMemberOrCreator(Long groupId, Long requestingUserId) {
        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new RuntimeException("Group not found"));
        boolean isCreator = requestingUserId != null && requestingUserId.equals(group.getCreatedBy());
        boolean isMember = requestingUserId != null
                && groupMemberRepository.existsByGroupIdAndUserId(groupId, requestingUserId);
        if (!isCreator && !isMember) {
            throw new RuntimeException("Unauthorized: you are not a member of this group");
        }
    }

    // Backward-compatible overload — no authorization check (internal/legacy callers)
    public GroupMember addMember(Long groupId, Long userId) {
        return addMember(groupId, userId, null);
    }

    // Add a member to a group — only an existing member or the creator may invite someone.
    public GroupMember addMember(Long groupId, Long userId, Long requestingUserId) {
        requireMemberOrCreator(groupId, requestingUserId);
        if (groupMemberRepository.existsByGroupIdAndUserId(groupId, userId)) {
            throw new RuntimeException("User is already a member of this group");
        }
        GroupMember member = new GroupMember();
        member.setGroupId(groupId);
        member.setUserId(userId);
        return groupMemberRepository.save(member);
    }

    /**
     * Remove a member from a group. Only the group creator may remove members,
     * and the creator themselves can never be removed.
     */
    public void removeMember(Long groupId, Long userId, Long requestingUserId) {
        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new RuntimeException("Group not found"));

        Long createdBy = group.getCreatedBy();

        // Only the creator can remove members (when the requester is known)
        if (requestingUserId != null && !requestingUserId.equals(createdBy)) {
            throw new RuntimeException("Only the group creator can remove members");
        }
        // The creator can never be removed from their own group
        if (userId.equals(createdBy)) {
            throw new RuntimeException("Cannot remove the group creator");
        }

        GroupMember target = groupMemberRepository.findByGroupId(groupId).stream()
                .filter(m -> m.getUserId().equals(userId))
                .findFirst()
                .orElseThrow(() -> new RuntimeException("Member not found"));

        // Block removal while the member has an outstanding balance — otherwise
        // their debts (or credits) would silently vanish from the group.
        BigDecimal b = rawBalances(groupId).getOrDefault(userId, BigDecimal.ZERO);
        if (b.abs().compareTo(new BigDecimal("0.01")) >= 0) {
            throw new RuntimeException("Cannot remove member with outstanding balance of GHS "
                    + b.abs().setScale(2, RoundingMode.HALF_UP).toPlainString()
                    + ". They must settle up first.");
        }

        groupMemberRepository.delete(target);
    }

    // Get all groups for a user
    public List<Group> getUserGroups(Long userId) {
        return groupRepository.findGroupsByUserId(userId);
    }

    /**
     * Splitwise-style net position across ALL the user's groups:
     * how much they owe in total vs how much they are owed.
     * Uses rawBalances — pure local math, no user lookups needed.
     */
    public Map<String, Object> getUserNetBalance(Long userId) {
        BigDecimal youOwe = BigDecimal.ZERO;
        BigDecimal youAreOwed = BigDecimal.ZERO;
        for (Group g : groupRepository.findGroupsByUserId(userId)) {
            BigDecimal b = rawBalances(g.getId()).getOrDefault(userId, BigDecimal.ZERO);
            if (b.compareTo(BigDecimal.ZERO) == 0) continue;
            if (b.signum() < 0) youOwe = youOwe.add(b.abs());
            else youAreOwed = youAreOwed.add(b);
        }
        Map<String, Object> net = new HashMap<>();
        net.put("youOwe", youOwe.setScale(2, RoundingMode.HALF_UP));
        net.put("youAreOwed", youAreOwed.setScale(2, RoundingMode.HALF_UP));
        return net;
    }

    // Backward-compatible overload — no authorization check (internal/legacy callers)
    public Map<String, Object> getGroupDetails(Long groupId) {
        return getGroupDetails(groupId, null, null);
    }

    // Get group details — members and expenses enriched with names.
    // requestingUserId is the JWT-authenticated caller and is the authorization
    // gate (must be a member/creator). viewingUserId is a separate, purely
    // cosmetic hint for which perspective to personalize each expense from —
    // it grants no access on its own and is kept distinct from the auth check.
    public Map<String, Object> getGroupDetails(Long groupId, Long viewingUserId, Long requestingUserId) {
        requireMemberOrCreator(groupId, requestingUserId);
        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new RuntimeException("Group not found"));
        List<GroupMember> members = groupMemberRepository.findByGroupId(groupId);
        List<SharedExpense> expenses = sharedExpenseRepository.findByGroupId(groupId);

        // ONE batch lookup for every member + payer (auth-service API)
        Set<Long> allUserIds = new HashSet<>();
        for (GroupMember m : members) allUserIds.add(m.getUserId());
        for (SharedExpense se : expenses) if (se.getPaidBy() != null) allUserIds.add(se.getPaidBy());
        Map<String, Map<String, Object>> lookup = lookupUsers(allUserIds);

        // Enrich members with name + avatar
        List<Map<String, Object>> enrichedMembers = new ArrayList<>();
        for (GroupMember m : members) {
            Map<String, Object> entry = new HashMap<>();
            entry.put("id",         m.getId());
            entry.put("groupId",    m.getGroupId());
            entry.put("userId",     m.getUserId());
            entry.put("joinedAt",   m.getJoinedAt() != null ? m.getJoinedAt().toString() : null);
            entry.put("name",       nameOf(lookup, m.getUserId()));
            entry.put("avatarData", avatarOf(lookup, m.getUserId(), "avatarData"));
            entry.put("avatarType", avatarOf(lookup, m.getUserId(), "avatarType"));
            enrichedMembers.add(entry);
        }

        // Enrich expenses with paidByName + paidByAvatarData (+ per-viewer share)
        int memberCount = Math.max(members.size(), 1);
        List<Map<String, Object>> enrichedExpenses = new ArrayList<>();
        for (SharedExpense se : expenses) {
            Map<String, Object> entry = new HashMap<>();
            entry.put("id",              se.getId());
            entry.put("groupId",         se.getGroupId());
            entry.put("paidBy",          se.getPaidBy());
            entry.put("paidByName",      nameOf(lookup, se.getPaidBy()));
            entry.put("paidByAvatarData", avatarOf(lookup, se.getPaidBy(), "avatarData"));
            entry.put("paidByAvatarType", avatarOf(lookup, se.getPaidBy(), "avatarType"));
            entry.put("amount",          se.getAmount());
            entry.put("description",     se.getDescription());
            entry.put("splitType",       se.getSplitType() != null ? se.getSplitType() : "EQUAL");
            entry.put("splitRatios",     se.getSplitRatios());
            entry.put("createdAt",       se.getCreatedAt() != null ? se.getCreatedAt().toString() : null);
            entry.put("memberCount",     memberCount);

            entry.put("settled",         Boolean.TRUE.equals(se.getSettled()));
            entry.put("participantCount", participantsOf(se, members).size());

            // Personalized fields for the viewing user
            if (viewingUserId != null && se.getAmount() != null) {
                BigDecimal userShare = shareFor(se, viewingUserId, members);
                boolean isPayer = viewingUserId.equals(se.getPaidBy());
                entry.put("userShare",     userShare);
                entry.put("isPayer",       isPayer);
                entry.put("displayAmount", isPayer ? se.getAmount() : userShare);
            }
            enrichedExpenses.add(entry);
        }

        Map<String, Object> details = new HashMap<>();
        details.put("group",    group);
        details.put("members",  enrichedMembers);
        details.put("expenses", enrichedExpenses);
        return details;
    }

    // Backward-compatible overload — no authorization check (internal/legacy callers)
    public SharedExpense addSharedExpense(Long groupId, Long paidBy, BigDecimal amount, String description) {
        return addSharedExpense(groupId, paidBy, amount, description, "EQUAL", null, null);
    }

    /**
     * Add a shared expense with either an EQUAL split or a CUSTOM percentage split.
     * For CUSTOM, splitRatios is a JSON map of userId → percentage that must cover
     * every group member and sum to exactly 100.
     *
     * requestingUserId is the JWT-authenticated caller: must be a group member
     * (or creator). paidBy must also be an actual group member — without this,
     * anyone could attribute a fabricated expense to an arbitrary userId
     * (including a non-member), inflating what real members appear to owe.
     */
    public SharedExpense addSharedExpense(Long groupId, Long paidBy, BigDecimal amount,
                                          String description, String splitType, String splitRatios,
                                          Long requestingUserId) {
        requireMemberOrCreator(groupId, requestingUserId);

        // Sanitize description: strip HTML tags (XSS), trim, treat blank as null
        if (description != null) {
            description = description.replaceAll("<[^>]*>", "").trim();
            if (description.isEmpty()) description = null;
        }

        // Amount must be positive, reasonable, and normalized to 2 decimal places
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new RuntimeException("Amount must be greater than zero");
        }
        if (amount.compareTo(new BigDecimal("1000000")) > 0) {
            throw new RuntimeException("Amount looks too large — maximum is GHS 1,000,000");
        }
        amount = amount.setScale(2, RoundingMode.HALF_UP);

        // Snapshot of members present RIGHT NOW — later joiners are excluded
        List<GroupMember> currentMembers = groupMemberRepository.findByGroupId(groupId);
        if (currentMembers.isEmpty()) {
            throw new RuntimeException("Group has no members");
        }
        boolean payerIsMember = currentMembers.stream().anyMatch(m -> m.getUserId().equals(paidBy));
        if (!payerIsMember) {
            throw new RuntimeException("paidBy must be a member of this group");
        }

        // Idempotency guard: an identical expense (same group+payer+amount+
        // description) added within the last 10 seconds is treated as a
        // double-submit — return the existing record instead of duplicating it.
        // Mirrors the same guard already applied to personal expenses.
        java.time.LocalDateTime cutoff = java.time.LocalDateTime.now().minusSeconds(10);
        for (SharedExpense recent : sharedExpenseRepository.findByGroupId(groupId)) {
            if (recent.getCreatedAt() != null && recent.getCreatedAt().isAfter(cutoff)
                    && recent.getPaidBy() != null && recent.getPaidBy().equals(paidBy)
                    && recent.getAmount() != null && recent.getAmount().compareTo(amount) == 0
                    && Objects.equals(recent.getDescription(), description)) {
                return recent;
            }
        }
        StringBuilder participantCsv = new StringBuilder();
        for (GroupMember m : currentMembers) {
            if (participantCsv.length() > 0) participantCsv.append(",");
            participantCsv.append(m.getUserId());
        }

        boolean custom = "CUSTOM".equalsIgnoreCase(splitType) && splitRatios != null && !splitRatios.isBlank();

        if (custom) {
            Map<Long, BigDecimal> ratios = parseSplitRatios(splitRatios);
            List<GroupMember> members = currentMembers;

            // Every group member must have a ratio
            for (GroupMember m : members) {
                if (!ratios.containsKey(m.getUserId())) {
                    throw new RuntimeException("Split ratios must include every group member (missing user #" + m.getUserId() + ")");
                }
            }
            // No ratios for people outside the group
            Set<Long> memberIds = new HashSet<>();
            for (GroupMember m : members) memberIds.add(m.getUserId());
            for (Long ratioUserId : ratios.keySet()) {
                if (!memberIds.contains(ratioUserId)) {
                    throw new RuntimeException("Split ratios include user #" + ratioUserId + " who is not a group member");
                }
            }
            // Percentages must be non-negative and sum to exactly 100
            BigDecimal sum = BigDecimal.ZERO;
            for (BigDecimal pct : ratios.values()) {
                if (pct.compareTo(BigDecimal.ZERO) < 0) {
                    throw new RuntimeException("Split percentages cannot be negative");
                }
                sum = sum.add(pct);
            }
            // Tolerance of 0.01 absorbs floating-point splits like 33.33+33.33+33.34
            if (sum.subtract(ONE_HUNDRED).abs().compareTo(new BigDecimal("0.01")) > 0) {
                throw new RuntimeException("Split percentages must add up to exactly 100 (got " + sum.stripTrailingZeros().toPlainString() + ")");
            }
        }

        SharedExpense expense = new SharedExpense();
        expense.setGroupId(groupId);
        expense.setPaidBy(paidBy);
        expense.setAmount(amount);
        expense.setDescription(description);
        expense.setSplitType(custom ? "CUSTOM" : "EQUAL");
        expense.setSplitRatios(custom ? splitRatios : null);
        expense.setParticipantIds(participantCsv.toString());
        expense.setSettled(false);
        return sharedExpenseRepository.save(expense);
    }

    /**
     * Pure balance math for a group: userId → net balance. Local tables only,
     * no user lookups — used by every caller that doesn't need display names
     * (net balance, remove-member guard, settle-up).
     */
    private Map<Long, BigDecimal> rawBalances(Long groupId) {
        List<GroupMember> members = groupMemberRepository.findByGroupId(groupId);
        List<SharedExpense> expenses = sharedExpenseRepository.findByGroupId(groupId);

        Map<Long, BigDecimal> balances = new HashMap<>();
        if (members.isEmpty()) return balances;
        for (GroupMember m : members) {
            balances.put(m.getUserId(), BigDecimal.ZERO);
        }

        for (SharedExpense expense : expenses) {
            // Settled expenses stay in history but no longer affect balances
            if (Boolean.TRUE.equals(expense.getSettled())) continue;
            if ("SETTLED".equals(expense.getDescription())) continue; // legacy marker
            if (expense.getAmount() == null) continue;

            // Payer is credited the full amount…
            balances.merge(expense.getPaidBy(), expense.getAmount(), BigDecimal::add);

            // …and every PARTICIPANT (payer included) is debited their share:
            // percentage-based for CUSTOM splits, equal among participants otherwise.
            // Members who joined after this expense was created owe nothing for it.
            for (GroupMember m : members) {
                BigDecimal share = shareFor(expense, m.getUserId(), members);
                if (share.compareTo(BigDecimal.ZERO) != 0) {
                    balances.merge(m.getUserId(), share.negate(), BigDecimal::add);
                }
            }
        }
        return balances;
    }

    // Calculate balances — who owes whom, with names (names via auth-service).
    // requestingUserId (the JWT-authenticated caller) must be a member/creator —
    // otherwise anyone could read any group's financial breakdown by guessing groupId.
    public List<Map<String, Object>> calculateBalances(Long groupId, Long requestingUserId) {
        requireMemberOrCreator(groupId, requestingUserId);
        Map<Long, BigDecimal> balances = rawBalances(groupId);

        List<Long> nonZeroIds = balances.entrySet().stream()
                .filter(e -> e.getValue().compareTo(BigDecimal.ZERO) != 0)
                .map(Map.Entry::getKey)
                .toList();
        Map<String, Map<String, Object>> lookup = lookupUsers(nonZeroIds);

        List<Map<String, Object>> debts = new ArrayList<>();
        for (Map.Entry<Long, BigDecimal> entry : balances.entrySet()) {
            if (entry.getValue().compareTo(BigDecimal.ZERO) != 0) {
                Map<String, Object> debt = new HashMap<>();
                debt.put("userId",     entry.getKey());
                debt.put("name",       nameOf(lookup, entry.getKey()));
                debt.put("avatarData", avatarOf(lookup, entry.getKey(), "avatarData"));
                debt.put("avatarType", avatarOf(lookup, entry.getKey(), "avatarType"));
                debt.put("balance",    entry.getValue());
                debt.put("owes",       entry.getValue().compareTo(BigDecimal.ZERO) < 0);
                debts.add(debt);
            }
        }
        return debts;
    }

    // Settle up — optionally trigger MoMo payment, then clear expenses.
    // Also records the settlement as an income-style expense for the group
    // creator (paymentMethod SETTLEMENT) so it appears in their history.
    public Map<String, Object> settleUp(Long groupId, Long userId, String phoneNumber) {
        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new RuntimeException("Group not found"));

        if (!groupMemberRepository.existsByGroupIdAndUserId(groupId, userId)) {
            throw new RuntimeException("User is not a member of this group");
        }

        // Capture the caller's JWT on the request thread for the MoMo call
        String callerAuthorization = BearerForward.currentAuthorization();

        String momoReferenceId = null;
        String momoStatus = null;

        // Calculate total owed by the settling user across UNSETTLED expenses
        List<GroupMember> members = groupMemberRepository.findByGroupId(groupId);
        List<SharedExpense> expenses = sharedExpenseRepository.findByGroupId(groupId);

        BigDecimal owedAmount = BigDecimal.ZERO;
        for (SharedExpense se : expenses) {
            if (Boolean.TRUE.equals(se.getSettled())) continue;
            if ("SETTLED".equals(se.getDescription())) continue; // legacy marker
            if (se.getAmount() == null || se.getPaidBy() == null) continue;
            if (!se.getPaidBy().equals(userId)) {
                // Respect participant snapshot + custom split ratios
                owedAmount = owedAmount.add(shareFor(se, userId, members));
            }
        }

        // Nothing to settle — return early without touching any records
        if (owedAmount.compareTo(new BigDecimal("0.01")) < 0) {
            Map<String, Object> nothing = new HashMap<>();
            nothing.put("message", "No outstanding balance to settle.");
            nothing.put("userId",  userId);
            nothing.put("groupId", groupId);
            nothing.put("settledAmount", BigDecimal.ZERO);
            return nothing;
        }

        // Who is OWED money right now — needed to credit the settlement to the
        // correct member(s), proportionally to what each is owed.
        Map<Long, BigDecimal> owedTo = new HashMap<>();
        BigDecimal totalOwed = BigDecimal.ZERO;
        for (Map.Entry<Long, BigDecimal> balance : rawBalances(groupId).entrySet()) {
            BigDecimal b = balance.getValue();
            Long owedUserId = balance.getKey();
            if (b.compareTo(BigDecimal.ZERO) > 0 && !owedUserId.equals(userId)) {
                owedTo.put(owedUserId, b);
                totalOwed = totalOwed.add(b);
            }
        }

        // If a phone number is provided, fire the MoMo request first — via
        // expense-service's /api/momo/pay (the single MoMo implementation).
        // Failures never block the settle-up, matching original behavior.
        if (phoneNumber != null && !phoneNumber.isBlank()) {
            try {
                Map<String, Object> momo = expenseServiceClient.momoRequestToPay(
                        phoneNumber, owedAmount, "Tally group settle-up", callerAuthorization);
                if (momo != null && Boolean.TRUE.equals(momo.get("success"))
                        && momo.get("referenceId") != null) {
                    momoReferenceId = String.valueOf(momo.get("referenceId"));
                    momoStatus = "PENDING";
                } else {
                    momoStatus = "FAILED";
                }
            } catch (Exception e) {
                // Log but don't block settle-up in sandbox
                System.err.println("MoMo request failed (sandbox): " + e.getMessage());
                momoStatus = "FAILED";
            }
        }

        // Mark expenses as settled — history is preserved, balances reset.
        // @Version on SharedExpense guards against concurrent settle-ups: a
        // simultaneous update throws OptimisticLockException and rolls back.
        for (SharedExpense se : expenses) {
            if (!Boolean.TRUE.equals(se.getSettled())) {
                se.setSettled(true);
            }
        }
        sharedExpenseRepository.saveAll(expenses);

        // Settler's display name via auth-service; degrade gracefully rather
        // than failing the settle if auth-service is briefly unreachable.
        String settlerName;
        try {
            settlerName = nameOf(lookupUsers(List.of(userId)), userId);
        } catch (Exception e) {
            settlerName = "User #" + userId;
        }

        // Record settlement income for the member(s) who were owed money,
        // split proportionally to how much each was owed. The expense belongs
        // to the OWED user, so we mint a scoped internal-service token acting
        // on their behalf (shared JWT_SECRET) — expense-service recognizes
        // this token shape distinctly from a real user session token and
        // only honors it on the one endpoint this flow needs.
        if (totalOwed.compareTo(BigDecimal.ZERO) > 0) {
            for (Map.Entry<Long, BigDecimal> owed : owedTo.entrySet()) {
                BigDecimal portion = owedAmount
                        .multiply(owed.getValue())
                        .divide(totalOwed, 2, RoundingMode.HALF_UP);
                if (portion.compareTo(BigDecimal.ZERO) <= 0) continue;
                try {
                    String serviceToken = jwtUtil.generateInternalServiceToken(owed.getKey());
                    expenseServiceClient.createSettlementExpense(
                            owed.getKey(),
                            portion,
                            "Settlement",
                            "Settlement received from " + settlerName + " in " + group.getName(),
                            LocalDate.now(),
                            "SETTLEMENT",
                            serviceToken);
                } catch (Exception e) {
                    // Non-fatal — the settle-up itself succeeded
                    System.err.println("Failed to record settlement expense: " + e.getMessage());
                }
            }
        }

        Map<String, Object> result = new HashMap<>();
        result.put("message", "Successfully settled up — expenses marked as settled");
        result.put("userId",  userId);
        result.put("groupId", groupId);
        result.put("settledAmount", owedAmount);
        result.put("settlerName",   settlerName);
        result.put("groupName",     group.getName());
        if (momoReferenceId != null) {
            result.put("momoReferenceId", momoReferenceId);
            result.put("momoStatus",      momoStatus);
        }
        return result;
    }

    // Overload for backward compatibility (no phone number)
    public Map<String, Object> settleUp(Long groupId, Long userId) {
        return settleUp(groupId, userId, null);
    }

    /**
     * Aggregate feed for expense-service's report/history composition
     * (GET /api/groups/user/{userId}/shared-data): every group the user is in,
     * with members and shared expenses, payer names included — one call
     * instead of expense-service reading group tables directly.
     */
    public Map<String, Object> getUserSharedData(Long userId) {
        List<Group> groups = groupRepository.findGroupsByUserId(userId);

        // one batch name lookup across ALL groups
        Set<Long> allUserIds = new HashSet<>();
        Map<Long, List<GroupMember>> membersByGroup = new HashMap<>();
        Map<Long, List<SharedExpense>> expensesByGroup = new HashMap<>();
        for (Group g : groups) {
            List<GroupMember> members = groupMemberRepository.findByGroupId(g.getId());
            List<SharedExpense> expenses = sharedExpenseRepository.findByGroupId(g.getId());
            membersByGroup.put(g.getId(), members);
            expensesByGroup.put(g.getId(), expenses);
            for (GroupMember m : members) allUserIds.add(m.getUserId());
            for (SharedExpense se : expenses) if (se.getPaidBy() != null) allUserIds.add(se.getPaidBy());
        }
        Map<String, Map<String, Object>> lookup = lookupUsers(allUserIds);

        List<Map<String, Object>> out = new ArrayList<>();
        for (Group g : groups) {
            Map<String, Object> groupEntry = new HashMap<>();
            groupEntry.put("groupId",   g.getId());
            groupEntry.put("groupName", g.getName());

            List<Map<String, Object>> memberList = new ArrayList<>();
            for (GroupMember m : membersByGroup.get(g.getId())) {
                Map<String, Object> me = new HashMap<>();
                me.put("userId", m.getUserId());
                me.put("name",   nameOf(lookup, m.getUserId()));
                memberList.add(me);
            }
            groupEntry.put("members", memberList);

            List<Map<String, Object>> expenseList = new ArrayList<>();
            for (SharedExpense se : expensesByGroup.get(g.getId())) {
                Map<String, Object> ee = new HashMap<>();
                ee.put("id",             se.getId());
                ee.put("amount",         se.getAmount());
                ee.put("description",    se.getDescription());
                ee.put("splitType",      se.getSplitType());
                ee.put("splitRatios",    se.getSplitRatios());
                ee.put("participantIds", se.getParticipantIds());
                ee.put("settled",        Boolean.TRUE.equals(se.getSettled()));
                ee.put("createdAt",      se.getCreatedAt() != null ? se.getCreatedAt().toString() : null);
                ee.put("paidBy",         se.getPaidBy());
                ee.put("paidByName",     nameOf(lookup, se.getPaidBy()));
                expenseList.add(ee);
            }
            groupEntry.put("expenses", expenseList);
            out.add(groupEntry);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("groups", out);
        return result;
    }

    // Only the group creator may delete a group — same bar as removeMember,
    // since this destroys every member's shared-expense history at once.
    public void deleteGroup(Long groupId, Long requestingUserId) {
        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new RuntimeException("Group not found"));
        if (requestingUserId == null || !requestingUserId.equals(group.getCreatedBy())) {
            throw new RuntimeException("Only the group creator can delete this group");
        }

        List<GroupMember> members = groupMemberRepository.findByGroupId(groupId);
        groupMemberRepository.deleteAll(members);

        List<SharedExpense> expenses = sharedExpenseRepository.findByGroupId(groupId);
        sharedExpenseRepository.deleteAll(expenses);

        groupRepository.deleteById(groupId);
    }
}
