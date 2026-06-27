package user_service.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import user_service.model.Group;
import user_service.model.GroupMember;
import user_service.model.SharedExpense;
import user_service.model.User;
import user_service.repository.GroupMemberRepository;
import user_service.repository.GroupRepository;
import user_service.repository.SharedExpenseRepository;
import user_service.repository.UserRepository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

@Service
public class GroupService {

    @Autowired
    private GroupRepository groupRepository;

    @Autowired
    private GroupMemberRepository groupMemberRepository;

    @Autowired
    private SharedExpenseRepository sharedExpenseRepository;

    @Autowired
    private UserRepository userRepository;

    // Fetch a user once and return it (null-safe)
    private User findUser(Long userId) {
        if (userId == null) return null;
        return userRepository.findById(userId).orElse(null);
    }

    private String resolveUserName(Long userId) {
        User u = findUser(userId);
        return u != null ? u.getName() : "User #" + userId;
    }

    private String resolveAvatarData(Long userId) {
        User u = findUser(userId);
        return u != null ? u.getAvatarData() : null;
    }

    private String resolveAvatarType(Long userId) {
        User u = findUser(userId);
        return u != null ? u.getAvatarType() : null;
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

    // Add a member to a group
    public GroupMember addMember(Long groupId, Long userId) {
        if (groupMemberRepository.existsByGroupIdAndUserId(groupId, userId)) {
            throw new RuntimeException("User is already a member of this group");
        }
        GroupMember member = new GroupMember();
        member.setGroupId(groupId);
        member.setUserId(userId);
        return groupMemberRepository.save(member);
    }

    // Get all groups for a user
    public List<Group> getUserGroups(Long userId) {
        return groupRepository.findGroupsByUserId(userId);
    }

    // Get group details — members and expenses enriched with names
    public Map<String, Object> getGroupDetails(Long groupId) {
        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new RuntimeException("Group not found"));
        List<GroupMember> members = groupMemberRepository.findByGroupId(groupId);
        List<SharedExpense> expenses = sharedExpenseRepository.findByGroupId(groupId);

        // Enrich members with name + avatar
        List<Map<String, Object>> enrichedMembers = new ArrayList<>();
        for (GroupMember m : members) {
            User u = findUser(m.getUserId());
            Map<String, Object> entry = new HashMap<>();
            entry.put("id",         m.getId());
            entry.put("groupId",    m.getGroupId());
            entry.put("userId",     m.getUserId());
            entry.put("joinedAt",   m.getJoinedAt() != null ? m.getJoinedAt().toString() : null);
            entry.put("name",       u != null ? u.getName()       : "User #" + m.getUserId());
            entry.put("avatarData", u != null ? u.getAvatarData() : null);
            entry.put("avatarType", u != null ? u.getAvatarType() : null);
            enrichedMembers.add(entry);
        }

        // Enrich expenses with paidByName + paidByAvatarData
        List<Map<String, Object>> enrichedExpenses = new ArrayList<>();
        for (SharedExpense se : expenses) {
            User payer = findUser(se.getPaidBy());
            Map<String, Object> entry = new HashMap<>();
            entry.put("id",              se.getId());
            entry.put("groupId",         se.getGroupId());
            entry.put("paidBy",          se.getPaidBy());
            entry.put("paidByName",      payer != null ? payer.getName()       : "User #" + se.getPaidBy());
            entry.put("paidByAvatarData",payer != null ? payer.getAvatarData() : null);
            entry.put("paidByAvatarType",payer != null ? payer.getAvatarType() : null);
            entry.put("amount",          se.getAmount());
            entry.put("description",     se.getDescription());
            entry.put("createdAt",       se.getCreatedAt() != null ? se.getCreatedAt().toString() : null);
            enrichedExpenses.add(entry);
        }

        Map<String, Object> details = new HashMap<>();
        details.put("group",    group);
        details.put("members",  enrichedMembers);
        details.put("expenses", enrichedExpenses);
        return details;
    }

    // Add a shared expense to a group
    public SharedExpense addSharedExpense(Long groupId, Long paidBy, BigDecimal amount, String description) {
        SharedExpense expense = new SharedExpense();
        expense.setGroupId(groupId);
        expense.setPaidBy(paidBy);
        expense.setAmount(amount);
        expense.setDescription(description);
        return sharedExpenseRepository.save(expense);
    }

    // Calculate balances — who owes whom, with names
    public List<Map<String, Object>> calculateBalances(Long groupId) {
        List<GroupMember> members = groupMemberRepository.findByGroupId(groupId);
        List<SharedExpense> expenses = sharedExpenseRepository.findByGroupId(groupId);

        int memberCount = members.size();
        if (memberCount == 0) return new ArrayList<>();

        Map<Long, BigDecimal> balances = new HashMap<>();
        for (GroupMember m : members) {
            balances.put(m.getUserId(), BigDecimal.ZERO);
        }

        for (SharedExpense expense : expenses) {
            if (expense.getDescription().equals("SETTLED")) continue;
            BigDecimal share = expense.getAmount()
                    .divide(BigDecimal.valueOf(memberCount), 2, RoundingMode.HALF_UP);

            balances.merge(expense.getPaidBy(), expense.getAmount(), BigDecimal::add);

            for (GroupMember m : members) {
                balances.merge(m.getUserId(), share.negate(), BigDecimal::add);
            }
        }

        List<Map<String, Object>> debts = new ArrayList<>();
        for (Map.Entry<Long, BigDecimal> entry : balances.entrySet()) {
            if (entry.getValue().compareTo(BigDecimal.ZERO) != 0) {
                User u = findUser(entry.getKey());
                Map<String, Object> debt = new HashMap<>();
                debt.put("userId",     entry.getKey());
                debt.put("name",       u != null ? u.getName()       : "User #" + entry.getKey());
                debt.put("avatarData", u != null ? u.getAvatarData() : null);
                debt.put("avatarType", u != null ? u.getAvatarType() : null);
                debt.put("balance",    entry.getValue());
                debt.put("owes",       entry.getValue().compareTo(BigDecimal.ZERO) < 0);
                debts.add(debt);
            }
        }
        return debts;
    }

    // Settle up — clear all debts for a user in a group
    public Map<String, Object> settleUp(Long groupId, Long userId) {
        groupRepository.findById(groupId)
                .orElseThrow(() -> new RuntimeException("Group not found"));

        if (!groupMemberRepository.existsByGroupIdAndUserId(groupId, userId)) {
            throw new RuntimeException("User is not a member of this group");
        }

        List<SharedExpense> expenses = sharedExpenseRepository.findByGroupId(groupId);
        sharedExpenseRepository.deleteAll(expenses);

        Map<String, Object> result = new HashMap<>();
        result.put("message", "Successfully settled up — all expenses cleared");
        result.put("userId",  userId);
        result.put("groupId", groupId);
        return result;
    }

    public void deleteGroup(Long groupId) {
        List<GroupMember> members = groupMemberRepository.findByGroupId(groupId);
        groupMemberRepository.deleteAll(members);

        List<SharedExpense> expenses = sharedExpenseRepository.findByGroupId(groupId);
        sharedExpenseRepository.deleteAll(expenses);

        groupRepository.deleteById(groupId);
    }
}
