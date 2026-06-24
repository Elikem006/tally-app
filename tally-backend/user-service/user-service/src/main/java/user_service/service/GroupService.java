package user_service.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import user_service.model.Group;
import user_service.model.GroupMember;
import user_service.model.SharedExpense;
import user_service.repository.GroupMemberRepository;
import user_service.repository.GroupRepository;
import user_service.repository.SharedExpenseRepository;

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

    // Create a new group
    public Group createGroup(String name, Long createdBy) {
        Group group = new Group();
        group.setName(name);
        group.setCreatedBy(createdBy);
        group = groupRepository.save(group);

        // Automatically add the creator as a member
        GroupMember member = new GroupMember();
        member.setGroupId(group.getId());
        member.setUserId(createdBy);
        groupMemberRepository.save(member);

        return group;
    }

    // Add a member to a group
    public GroupMember addMember(Long groupId, Long userId) {
        // Check if already a member
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

    // Get group details with members
    public Map<String, Object> getGroupDetails(Long groupId) {
        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new RuntimeException("Group not found"));
        List<GroupMember> members = groupMemberRepository.findByGroupId(groupId);
        List<SharedExpense> expenses = sharedExpenseRepository.findByGroupId(groupId);

        Map<String, Object> details = new HashMap<>();
        details.put("group", group);
        details.put("members", members);
        details.put("expenses", expenses);
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

    // Calculate balances — who owes whom
    public List<Map<String, Object>> calculateBalances(Long groupId) {
        List<GroupMember> members = groupMemberRepository.findByGroupId(groupId);
        List<SharedExpense> expenses = sharedExpenseRepository.findByGroupId(groupId);

        int memberCount = members.size();
        if (memberCount == 0) return new ArrayList<>();

        // Track net balance for each user
        // Positive = they are owed money, Negative = they owe money
        Map<Long, BigDecimal> balances = new HashMap<>();
        for (GroupMember m : members) {
            balances.put(m.getUserId(), BigDecimal.ZERO);
        }

        for (SharedExpense expense : expenses) {
            BigDecimal share = expense.getAmount()
                    .divide(BigDecimal.valueOf(memberCount), 2, RoundingMode.HALF_UP);

            // Person who paid gets credited the full amount
            balances.merge(expense.getPaidBy(), expense.getAmount(), BigDecimal::add);

            // Everyone (including payer) gets debited their share
            for (GroupMember m : members) {
                balances.merge(m.getUserId(), share.negate(), BigDecimal::add);
            }
        }

        // Convert balances into readable debts
        List<Map<String, Object>> debts = new ArrayList<>();
        for (Map.Entry<Long, BigDecimal> entry : balances.entrySet()) {
            if (entry.getValue().compareTo(BigDecimal.ZERO) != 0) {
                Map<String, Object> debt = new HashMap<>();
                debt.put("userId", entry.getKey());
                debt.put("balance", entry.getValue());
                debt.put("owes", entry.getValue().compareTo(BigDecimal.ZERO) < 0);
                debts.add(debt);
            }
        }
        return debts;
    }
    // Settle up — clear all debts for a user in a group
    public Map<String, Object> settleUp(Long groupId, Long userId) {
        // Verify the group exists
        groupRepository.findById(groupId)
                .orElseThrow(() -> new RuntimeException("Group not found"));

        // Verify the user is a member
        if (!groupMemberRepository.existsByGroupIdAndUserId(groupId, userId)) {
            throw new RuntimeException("User is not a member of this group");
        }

        // Add a settle up expense with negative amount to clear the balance
        List<GroupMember> members = groupMemberRepository.findByGroupId(groupId);
        List<SharedExpense> expenses = sharedExpenseRepository.findByGroupId(groupId);

        // Calculate what this user owes
        int memberCount = members.size();
        Map<Long, java.math.BigDecimal> balances = new HashMap<>();
        for (GroupMember m : members) {
            balances.put(m.getUserId(), java.math.BigDecimal.ZERO);
        }

        for (SharedExpense expense : expenses) {
            if (expense.getDescription().equals("SETTLED")) continue;
            java.math.BigDecimal share = expense.getAmount()
                    .divide(java.math.BigDecimal.valueOf(memberCount), 2, java.math.RoundingMode.HALF_UP);
            balances.merge(expense.getPaidBy(), expense.getAmount(), java.math.BigDecimal::add);
            for (GroupMember m : members) {
                balances.merge(m.getUserId(), share.negate(), java.math.BigDecimal::add);
            }
        }

        java.math.BigDecimal userBalance = balances.getOrDefault(userId, java.math.BigDecimal.ZERO);

        // If user owes money, create a settlement expense
        if (userBalance.compareTo(java.math.BigDecimal.ZERO) < 0) {
            SharedExpense settlement = new SharedExpense();
            settlement.setGroupId(groupId);
            settlement.setPaidBy(userId);
            settlement.setAmount(userBalance.negate().multiply(java.math.BigDecimal.valueOf(memberCount)));
            settlement.setDescription("SETTLED");
            settlement.setSplitType("EQUAL");
            sharedExpenseRepository.save(settlement);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("message", "Successfully settled up");
        result.put("userId", userId);
        result.put("groupId", groupId);
        return result;
    }
}