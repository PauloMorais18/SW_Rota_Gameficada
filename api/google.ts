import { nodeHandler } from '../src/server/http.js';
import { googleLogin } from '../src/server/google.js';
export default nodeHandler('GET', googleLogin);
