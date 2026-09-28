export interface TCRow {
  id: number;
  code: string;
  password_hash: string;
  name: string;
  active: boolean;
  email: string;
  mobile: string
}

export interface TCTokenPayload {
  type: "tc";
  sub: number;
  username: string;
  displayName: string;
  mobile: string;
  email: string;
  active: boolean;
}

export interface tcLoginResult {
  token: string;
  operator: {
    id: number;
    username: string;
    displayName: string;
    mobile:string;
    email:string;
    active: boolean;
  };
}
