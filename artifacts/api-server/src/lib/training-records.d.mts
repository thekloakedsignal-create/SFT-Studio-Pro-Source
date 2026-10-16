import type { Pool } from "pg";
export function trainingPool(): Pool;
export function getRecord(kind: string, id: string): Promise<any | null>;
export function listRecords(kind: string, ownerId?: string): Promise<Array<{ id: string; data: any }>>;
export function setRecord(kind: string, id: string, data: Record<string, unknown>): Promise<void>;
export function createRecord(kind: string, id: string, data: Record<string, unknown>): Promise<boolean>;
export function deleteRecord(kind: string, id: string): Promise<void>;
