import type { ErasedToolDefinition } from "./definition.js";
import { ReadTool } from "./read.js";
import { WriteTool } from "./write.js";
import { EditTool } from "./edit.js";
import { BashTool } from "./bash.js";
import { GlobTool } from "./glob.js";
import { GrepTool } from "./grep.js";
import { AskUserTool } from "./ask-user.js";
import { TodoWriteTool } from "./todo-write.js";

export const builtinTools: ErasedToolDefinition[] = [
  ReadTool,
  WriteTool,
  EditTool,
  BashTool,
  GlobTool,
  GrepTool,
  AskUserTool,
  TodoWriteTool,
];
