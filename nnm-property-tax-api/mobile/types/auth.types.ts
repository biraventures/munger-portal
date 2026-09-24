export interface OperatorRow {
  id: number;
  username: string;
  password_hash: string;
  display_name: string;
  active: boolean;
  email: string | null;
  is_demo: boolean;
}

export interface LoginResult {
  token: string;
  operator: {
    id: number;
    username: string;
    displayName: string;
    isDemo: boolean;
  };
}

/** Payload embedded in the JWT — kept minimal on purpose. */
export interface OperatorTokenPayload {
  type: "operator";
  sub: number; // operator id
  username: string;
  displayName: string;
  isDemo: boolean;
}