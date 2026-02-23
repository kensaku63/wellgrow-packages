import { memo } from "react";
import { Box, Text } from "ink";
import type { TodoItem } from "../tools/todo-write.js";
import { colors } from "./colors.js";

interface TodoListProps {
  todos: TodoItem[];
}

export const TodoList = memo(function TodoList({ todos }: TodoListProps) {
  if (todos.length === 0) return null;

  const completed = todos.filter((t) => t.status === "completed").length;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={colors.insight}
      paddingX={1}
      marginTop={1}
    >
      <Text color={colors.insight} bold>
        📋 Tasks ({completed}/{todos.length})
      </Text>
      {todos.map((todo, i) => (
        <Box key={i}>
          {todo.status === "pending" && (
            <Text color={colors.fog}>○ {todo.content}</Text>
          )}
          {todo.status === "in_progress" && (
            <Text color={colors.insight}>▸ {todo.activeForm}</Text>
          )}
          {todo.status === "completed" && (
            <Text color={colors.growth}>✓ {todo.content}</Text>
          )}
        </Box>
      ))}
    </Box>
  );
});
