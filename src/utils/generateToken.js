import { signAccessToken } from "./jwt.js";

const generateToken = (user) => signAccessToken(user);

export default generateToken;
