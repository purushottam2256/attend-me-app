// Auto-generated
export const FallbackAvatars = [
  require('../../assets/Userpics/01.png'),
  require('../../assets/Userpics/Funny Bunny-7.png'),
  require('../../assets/Userpics/Funny Bunny.png'),
  require('../../assets/Userpics/Guacamole-2.png'),
  require('../../assets/Userpics/Guacamole-3.png'),
  require('../../assets/Userpics/Guacamole.png'),
  require('../../assets/Userpics/No Comments-1.png'),
  require('../../assets/Userpics/No Comments-2.png'),
  require('../../assets/Userpics/No Comments-3.png'),
  require('../../assets/Userpics/No Comments.png'),
  require('../../assets/Userpics/No comments 4.png'),
  require('../../assets/Userpics/No comments 6.png'),
  require('../../assets/Userpics/No comments 8.png'),
  require('../../assets/Userpics/No gravity-1.png'),
  require('../../assets/Userpics/No gravity-2.png'),
  require('../../assets/Userpics/No gravity-3.png'),
  require('../../assets/Userpics/No gravity.png'),
  require('../../assets/Userpics/Teamwork-4.png'),
  require('../../assets/Userpics/Teamwork-8.png'),
  require('../../assets/Userpics/Upstream-1.png'),
  require('../../assets/Userpics/Upstream-2.png'),
  require('../../assets/Userpics/Upstream-3.png'),
  require('../../assets/Userpics/Upstream-4.png'),
  require('../../assets/Userpics/Upstream-5.png'),
  require('../../assets/Userpics/Upstream-8.png'),
  require('../../assets/Userpics/Upstream.png'),
];
export const getFallbackAvatar = (id: string) => {
  if (!id) return FallbackAvatars[0];
  let hash = 0;
  for(let i=0;i<id.length;i++){hash = id.charCodeAt(i) + ((hash << 5) - hash);}
  return FallbackAvatars[Math.abs(hash) % FallbackAvatars.length];
};
