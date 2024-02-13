import PocketBase from 'pocketbase';


const pb = new PocketBase("https://onabudget.fly.dev/");
pb.autoCancellation(false);


export default pb;