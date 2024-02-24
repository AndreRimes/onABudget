import PocketBase from 'pocketbase';


const pb = new PocketBase(process.env.NEXT_PUBLIC_PB);
pb.autoCancellation(false);

export default pb;
