export type Basis = "observed" | "inferred";

export type WorkflowId =
    | "auth"
    | "add_to_cart"
    | "checkout_payment"
    | "seller_product"
    | "data_layer";

export interface Evidence {
    path: string;
    lines?: [number, number];
    note?: string;
}

export interface Claim {
    text: string;
    basis: Basis;
    evidence: Evidence[];
}

export interface Meta {
    schemaVersion: 1;
    mock: boolean;
    repoCommit: string;
    generatedBy: {
        member: string;
        bobTask: string;
        mode: string;
    };
}

// overview.json
export interface Overview {
    meta: Meta;
    repo: {
        name: string;
        url: string;
        licence: string;
    };
    oneLine: string;
    stack: Claim[];
    entryPoints: Claim[];
    keyFacts: Claim[];
}

// architecture.json
export interface Architecture {
    meta: Meta;
    layers: {
        id: string;
        name: string;
        summary: string;
        paths: string[];
        evidence: Evidence[];
    }[];
    edges: {
        from: string;
        to: string;
        label: string;
        basis: Basis;
        evidence: Evidence[];
    }[];
    mermaid: string;
}

// workflows.json
export interface Workflows {
    meta: Meta;
    workflows: {
        id: WorkflowId;
        name: string;
        actor: "visitor" | "customer" | "seller" | "developer";
        summary: string;
        steps: {
            order: number;
            text: string;
            evidence: Evidence[];
        }[];
        externalServices: string[];
        needsSecretsToRun: boolean;
        basis: Basis;
    }[];
}

// reading-order.json
export interface ReadingOrder {
    meta: Meta;
    steps: {
        id: string;
        order: number;
        title: string;
        why: string;
        paths: string[];
        workflowIds: WorkflowId[];
        required: boolean;
        minutes: number;
    }[];
}

// quiz.json
export interface Quiz {
    meta: Meta;
    questions: {
        id: string;
        workflowId: WorkflowId;
        readingStepId: string;
        prompt: string;
        options: {
            id: string;
            text: string;
        }[];
        answerId: string;
        explanation: string;
        evidence: Evidence[];
    }[];
    readiness: {
        thresholdPercent: number;
        weights: {
            reading: 30;
            quiz: 50;
            workflows: 20;
        };
        requiredWorkflowIds: WorkflowId[];
    };
}

// tasks.json
export interface Tasks {
    meta: Meta;
    candidates: {
        id: string;
        title: string;
        workflowId: WorkflowId;
        files: string[];
        risk: "low" | "medium" | "high";
        validation: string[];
        externalDependencyRisk: string;
        decision: "selected" | "rejected";
        reason: string;
        evidence: Evidence[];
    }[];
    selectedId: string;
    blastRadius: {
        changedFiles: string[];
        directDependents: Evidence[];
        indirectImpact: Claim[];
        risks: Claim[];
        validation: {
            command: string;
            env: string;
            expected: string;
            result: "not_run" | "pass" | "fail_code" | "fail_env";
            log: string;
        }[];
        rollback: string;
    };
}