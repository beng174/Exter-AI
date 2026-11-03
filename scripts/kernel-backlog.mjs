import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
export function nextKernelTask(backlog) {
  const completed=new Set(backlog.tasks.filter(task=>task.status==="done").map(task=>task.id));
  return backlog.tasks.find(task=>task.status==="in_progress") || backlog.tasks.find(task=>task.status==="ready"&&task.dependsOn.every(id=>completed.has(id))) || null;
}
export function taskContext(task) {
  return [task.id+": "+task.title,"Status: "+task.status,"Goal: "+task.goal,"Read: "+task.files.join(", "),"Acceptance:",...task.acceptance.map(value=>"- "+value),"Checks: "+task.checks.join("; "),...(task.blockers?.length?["Blockers:",...task.blockers.map(value=>"- "+value)]:[])].join("\n");
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  const backlog=JSON.parse(readFileSync(new URL("../research/KERNEL-BACKLOG.json",import.meta.url),"utf8"));
  const command=process.argv[2]||"next",id=process.argv[3];
  if(!["next","show"].includes(command)){console.error("Use kernel-backlog.mjs next or show TASK_ID.");process.exitCode=1;}
  else{const task=command==="show"?backlog.tasks.find(task=>task.id===id):nextKernelTask(backlog);if(task)console.log(taskContext(task));else if(command==="show"){console.error("Task not found.");process.exitCode=1;}else console.log("No ready task. Review the listed blockers in research/KERNEL-BACKLOG.json.");}
}
