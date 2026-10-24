/**
 * Ad-hoc multi-step orchestration for callers who want a skill-shaped pipeline
 * without declaring a {@link Skill} subclass.
 *
 * Steps run in priority order (lower first, declaration order breaking ties)
 * and thread one context through, same as a skill.
 */
export interface WorkflowStep<TContext> {
  name: string;
  priority: number;
  run(context: TContext): Promise<TContext> | TContext;
}

export class Workflow<TContext extends Record<string, unknown>> {
  private readonly workflowSteps: Array<WorkflowStep<TContext>> = [];

  constructor(public readonly name = "workflow") {}

  /** Appends a step. Lower `priority` runs earlier; the default is 10. */
  public step(
    name: string,
    run: (context: TContext) => Promise<TContext> | TContext,
    priority = 10,
  ): this {
    this.workflowSteps.push({ name, priority, run });
    return this;
  }

  public get steps(): ReadonlyArray<WorkflowStep<TContext>> {
    return this.ordered();
  }

  /** Runs every step in order and returns the final context. */
  public async call(context: TContext): Promise<TContext> {
    let current = context;

    for (const step of this.ordered()) {
      current = await step.run(current);
    }

    return current;
  }

  /**
   * Runs every step, stopping at the first failure and reporting which step
   * failed rather than surfacing a bare error.
   */
  public async run(context: TContext): Promise<
    | { ok: true; context: TContext; completed: string[] }
    | {
        ok: false;
        context: TContext;
        completed: string[];
        failedStep: string;
        error: unknown;
      }
  > {
    let current = context;
    const completed: string[] = [];

    for (const step of this.ordered()) {
      try {
        current = await step.run(current);
        completed.push(step.name);
      } catch (error) {
        return {
          ok: false,
          context: current,
          completed,
          failedStep: step.name,
          error,
        };
      }
    }

    return { ok: true, context: current, completed };
  }

  private ordered(): Array<WorkflowStep<TContext>> {
    // Sorting a copy keeps insertion order stable for equal priorities.
    return [...this.workflowSteps].sort((a, b) => a.priority - b.priority);
  }
}
