export function reconcileApprovedTraining(user: {
  uid: string;
  identityEmail: string | null;
  email_verified: boolean;
}): Promise<{ applicable?: boolean; complete?: boolean }>;
