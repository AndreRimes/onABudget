import PocketBase from 'pocketbase';


console.log(process.env.NEXT_PUBLIC_PB);
const pb = new PocketBase(process.env.NEXT_PUBLIC_PB);
pb.autoCancellation(false);

export default pb;
