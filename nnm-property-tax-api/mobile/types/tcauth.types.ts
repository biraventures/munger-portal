



export interface TCTokenPayload {
  type: "tc";
  sub: number;
  username: string;
  displayName: string;
  mobile:string;
  email:string;
  active: boolean;
  code:string;
}





export interface tcLoginResult {
  token: string;
  operator: {
    id: number;
    username: string;
    displayName: string;
    isDemo: boolean;
  };
}