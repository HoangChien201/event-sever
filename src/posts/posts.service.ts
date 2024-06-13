import { Injectable } from '@nestjs/common';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Posts } from './entities/posts.entity';
import { Repository } from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import { LikePost } from 'src/like-posts/entities/like-post.entity';
import { Comment } from 'src/comment/entities/comment.entity';
import { TagPost } from 'src/tag-posts/entities/tag-post.entity';
import { USER_ID_HEADER_NAME } from 'src/auth/constant';
import { Friendship } from 'src/friendship/entities/friendship.entity';
import { bodyGetByUser } from './posts.controller';
import { LikeComment } from 'src/like-comment/entities/like-comment.entity';
import { Media } from 'src/media/entities/media.entity';


const PERMISSION_FRIEND=1
const PERMISSION_PRIVATE=2
@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Posts)
    private readonly postsRepository: Repository<Posts>,
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    @InjectRepository(LikePost)
    private readonly likePostRepository: Repository<LikePost>,
    @InjectRepository(LikeComment)
    private readonly likeCommentRepository: Repository<LikeComment>,
    @InjectRepository(TagPost)
    private readonly tagRepository: Repository<TagPost>,
    @InjectRepository(Media)
    private readonly mediaRepository: Repository<Media>,
    @InjectRepository(Friendship)
    private readonly friendRepository: Repository<Friendship>
  ) { }

  private async createPost(createPostDto: CreatePostDto, creater: number) {
    try {
      //gán id người đăng bài viết
    createPostDto.creater = creater

    const { tags, medias, ...rest } = createPostDto
    if(!medias && !rest.content ){
      return {
        status:-1,
        message:'Not data'
      }
    }
    
    const postsCreate = await this.postsRepository.save(rest);

    // //create tags
    if (tags) {
      const tagsCreate = tags.map(t => {
        return {
          ...t,
          posts_id: postsCreate.id
        }
      })
      await this.tagRepository.insert(tagsCreate);

    }
    // //create media
    if (medias) {
      const mediasCreate = medias.map(m => {
        return {
          ...m,
          posts_id: postsCreate.id
        }
      })
      
      await this.mediaRepository.insert(mediasCreate)
      
    }

    
    return {
      status:1,
      message:'OKE'
    };
    } catch (error) {
      return {
        status:-1,
        message:''+error
      };
    }
    
  }

  private async sharePost(createPostDto: CreatePostDto, creater: number) {
    const posts_id = createPostDto['id']
    console.log('share');

    //gán id người đăng bài viết
    createPostDto.creater = creater
    createPostDto['share'] = posts_id
    const { id, ...rest } = createPostDto
    console.log('rest', rest);

    if (!posts_id) return "Không tìm thấy id bài posts"

    await this.postsRepository.save(rest)
    return "Share thành công"
  }

  async create(createPostDto: CreatePostDto, request: Request): Promise<any> {
    try {
      const creater = request.headers[USER_ID_HEADER_NAME]

      if (createPostDto['id']) return this.sharePost(createPostDto, creater)

      return this.createPost(createPostDto, creater)
    } catch (error) {
      return error
    }
  }

  async findByUser(request: Request, user_id:number): Promise<Posts[] | string> {
    //get user from token
    const user_req = request.headers[USER_ID_HEADER_NAME]

    try {

      const postsQuery = await this.postsRepository.
        createQueryBuilder('p')
        .select()
        .where({
          creater: user_id,
        })
        .andWhere(
          ()=>{
            if(parseInt(user_id.toString()) === parseInt(user_req)){
              return `p.permission IN (:...ids)`
            }
            else{
              return `p.permission = ${PERMISSION_FRIEND}`
            }
          },{ids:[PERMISSION_PRIVATE,PERMISSION_FRIEND]}
        )
        .leftJoin('p.media', 'media')
        .addSelect(['media.url', 'media.resource_type'])

        .leftJoin('p.creater', 'creater')
        .addSelect(['creater.id', 'creater.fullname', 'creater.avatar'])

        .leftJoinAndSelect('p.tags', 'tags')

        .leftJoin('tags.user', 'user')
        .addSelect(['user.fullname'])

        .orderBy('p.create_at', 'DESC')
        .getMany()

        

      const reactionPosts = await this.postsRepository.createQueryBuilder('p')
        .leftJoinAndSelect(
          (qb) =>
            qb.subQuery()
              .select('c.posts', 'posts_id')
              .addSelect('COUNT(c.posts)', 'comment_count')
              .from(Comment, 'c')
              .groupBy('c.posts')
          ,
          'c',
          'c.posts_id = p.id'
        )
        .leftJoinAndSelect(
          (qb) =>
            qb.subQuery()
              .select('l.posts', 'posts_id')
              .addSelect('COUNT(l.posts)', 'like_count')
              .from(LikePost, 'l')
              .groupBy('l.posts'),
          'l',
          'l.posts_id = p.id'
        )

        .leftJoin(
          (qb) =>
            qb.subQuery()
              .leftJoinAndSelect(
                (qb) =>
                  qb.subQuery()
                    .select('l.*')
                    .from(LikePost, 'l')
                ,
                'l', 'l.user=u.id'
              )
              .from(User, 'u')
              .where(`u.id=${user_req}`)
          , 'u', 'u.posts=p.id'
        )
        .leftJoinAndSelect(
          (qb) =>
            qb.subQuery()
              .select('p2.shareId')
              .addSelect('COUNT(p2.shareId)', 'share_count')
              .from(Posts, 'p2')
              .where("p2.shareId IS NOT NULL")
              .groupBy('p2.shareId')

          ,
          'p2', 'p2.shareId=p.id'
        )
        .select([
          'p2.share_count',
          'c.comment_count',
          'l.like_count',
          'u.reaction',
        ])
        .where(`p.creater=${user_id}`)
        .orderBy('p.create_at', 'DESC')
        .getRawMany();
      // Convert raws to our appropriate objects 
      const posts = postsQuery.map((v, i) => {
        return {
          ...v,
          ...reactionPosts[i]
        }
      })

      return posts
    } catch (error) {
      return ''+error
    }

  }

  async findOne(id: number, request: Request): Promise<Posts> {
    //get user from token
    const user_req = request.headers[USER_ID_HEADER_NAME];
    try {
      const postsQuery = await this.postsRepository.
        createQueryBuilder('p')
        .select()
        .where('p.id = :id', { id: id })
        .leftJoin('p.media', 'media')
        .addSelect(['media.url', 'media.resource_type'])
        .leftJoin('p.tags', 'tags')
        .leftJoin('tags.user', 'user')
        .addSelect(['user.fullname', 'tags.user'])
        .getOne()


      const reactionPosts = await this.postsRepository.createQueryBuilder('p')
        .leftJoinAndSelect(
          (qb) =>
            qb.subQuery()
              .select('c.posts', 'posts_id')
              .addSelect('COUNT(c.posts)', 'comment_count')
              .from(Comment, 'c')
              .groupBy('c.posts')
          ,
          'c',
          'c.posts_id = p.id'
        )
        .leftJoinAndSelect(
          (qb) =>
            qb.subQuery()
              .select('l.posts', 'posts_id')
              .addSelect('COUNT(l.posts)', 'like_count')
              .from(LikePost, 'l')
              .groupBy('l.posts'),
          'l',
          'l.posts_id = p.id'
        )
        .leftJoin(
          (qb) =>
            qb.subQuery()
              .leftJoinAndSelect(
                (qb) =>
                  qb.subQuery()
                    .select('l.*')
                    .from(LikePost, 'l')
                ,
                'l', 'l.user=u.id'
              )
              .from(User, 'u')
              .where(`u.id=${user_req}`)
          , 'u', 'u.posts=p.id'
        )
        .leftJoinAndSelect(
          (qb) =>
            qb.subQuery()
              .select('p2.shareId')
              .addSelect('COUNT(p2.shareId)', 'share_count')
              .from(Posts, 'p2')
              .where("p2.shareId IS NOT NULL")
              .groupBy('p2.shareId')

          ,
          'p2', 'p2.shareId=p.id'
        )
        .select([
          'p2.share_count',
          'c.comment_count',
          'l.like_count',
          'u.reaction',
        ])
        .where(`p.id=${id}`)
        .getRawOne();

      // Convert raws to our appropriate objects 
      const posts = {
        ...postsQuery,
        ...reactionPosts
      }

      return posts
    } catch (error) {
      return error
    }
  }

  async findAll(request: Request): Promise<Posts[]> {
    //get user from token
    const user_req = request.headers[USER_ID_HEADER_NAME];
    try {
      const postsQuery = await this.postsRepository.
        createQueryBuilder('p')
        .select()
        .leftJoin('p.media', 'media')
        .addSelect(['media.url', 'media.resource_type'])
        .leftJoin('p.tags', 'tags')
        .leftJoin('tags.user', 'user')
        .addSelect(['user.fullname', 'tags.user'])
        .orderBy('p.create_at', 'DESC')
        .getMany()

        //filter id posts
        const idPosts=postsQuery.map((p)=>{
          return p.id
        })

      const reactionPosts = await this.postsRepository.createQueryBuilder('p')
        .leftJoinAndSelect(
          (qb) =>
            qb.subQuery()
              .select('c.posts', 'posts_id')
              .addSelect('COUNT(c.posts)', 'comment_count')
              .from(Comment, 'c')
              .groupBy('c.posts')
          ,
          'c',
          'c.posts_id = p.id'
        )
        .leftJoinAndSelect(
          (qb) =>
            qb.subQuery()
              .select('l.posts', 'posts_id')
              .addSelect('COUNT(l.posts)', 'like_count')
              .from(LikePost, 'l')
              .groupBy('l.posts'),
          'l',
          'l.posts_id = p.id'
        )
        .leftJoin(
          (qb) =>
            qb.subQuery()
              .leftJoinAndSelect(
                (qb) =>
                  qb.subQuery()
                    .select('l.*')
                    .from(LikePost, 'l')
                ,
                'l', 'l.user=u.id'
              )
              .from(User, 'u')
              .where(`u.id=${user_req}`)
          , 'u', 'u.posts=p.id'
        )
        .leftJoinAndSelect(
          (qb) =>
            qb.subQuery()
              .select('p2.shareId')
              .addSelect('COUNT(p2.shareId)', 'share_count')
              .from(Posts, 'p2')
              .where("p2.shareId IS NOT NULL")
              .groupBy('p2.shareId')

          ,
          'p2', 'p2.shareId=p.id'
        )
        .where(`p.id IN (:...ids)`,{ids:idPosts})
        .select([
          'p2.share_count',
          'c.comment_count',
          'l.like_count',
          'u.reaction',
        ])
        .orderBy('p.create_at', 'DESC')
        .getRawMany();

      // Convert raws to our appropriate objects 
      const posts = postsQuery.map((v, i) => {
        return {
          ...v,
          ...reactionPosts[i]
        }
      })

      return posts
    } catch (error) {
      return error
    }
  }

  async findByUserRequest(request: Request): Promise<Posts[]> {
    //get user from token
    const user_req = request.headers[USER_ID_HEADER_NAME];
    try {

      //lấy danh sách bạn bè của user
      let friendOfUser = await this.friendRepository
        .createQueryBuilder('f')
        .where({
          status: 2,
          user1: user_req,
        })
        .orWhere({
          status: 2,
          user2: user_req,
        }).getMany()

      const idfriendOfUsers = friendOfUser.map(f => {
        if (f.user1 === user_req) {
          return f.user2
        }
        return f.user1
      })

      const postsQuery = await this.postsRepository.
        createQueryBuilder('p')
        .where({
          permission: PERMISSION_FRIEND,
        })
        .andWhere(
          `p.creater IN (:...ids)`, { ids: [...idfriendOfUsers, user_req] }
        )

        .leftJoin('p.creater','creater')
        .addSelect(['creater.id','creater.fullname','creater.avatar'])

        .leftJoin('p.media', 'media')
        .addSelect(['media.url', 'media.resource_type'])

        .leftJoin('p.tags', 'tags')
        .leftJoin('tags.user', 'user')
        .addSelect(['user.fullname', 'tags.user'])
        .orderBy('p.create_at', 'DESC')
        .getMany()

        //get id posts
        const idPosts=postsQuery.map((p)=>{
          return p.id
        })

      const reactionPosts = await this.postsRepository.createQueryBuilder('p')
        .leftJoinAndSelect(
          (qb) =>
            qb.subQuery()
              .select('c.posts', 'posts_id')
              .addSelect('COUNT(c.posts)', 'comment_count')
              .from(Comment, 'c')
              .groupBy('c.posts')
          ,
          'c',
          'c.posts_id = p.id'
        )
        .leftJoinAndSelect(
          (qb) =>
            qb.subQuery()
              .select('l.posts', 'posts_id')
              .addSelect('COUNT(l.posts)', 'like_count')
              .from(LikePost, 'l')
              .groupBy('l.posts'),
          'l',
          'l.posts_id = p.id'
        )
        .leftJoin(
          (qb) =>
            qb.subQuery()
              .leftJoinAndSelect(
                (qb) =>
                  qb.subQuery()
                    .select('l.*')
                    .from(LikePost, 'l')
                ,
                'l', 'l.user=u.id'
              )
              .from(User, 'u')
              .where(`u.id=${user_req}`)
          , 'u', 'u.posts=p.id'
        )
        .leftJoinAndSelect(
          (qb) =>
            qb.subQuery()
              .select('p2.shareId')
              .addSelect('COUNT(p2.shareId)', 'share_count')
              .from(Posts, 'p2')
              .where("p2.shareId IS NOT NULL")
              .groupBy('p2.shareId')

          ,
          'p2', 'p2.shareId=p.id'
        )
        .where(`p.id IN (:...ids)`, { ids: idPosts })
        .select([
          'p2.share_count',
          'c.comment_count',
          'l.like_count',
          'u.reaction',
        ])
        .orderBy('p.create_at', 'DESC')
        .getRawMany();

      // Convert raws to our appropriate objects 
      const posts = postsQuery.map((v, i) => {
        return {
          ...v,
          ...reactionPosts[i]
        }
      })

      return posts
    } catch (error) {
      return error
    }
  }

  async findShare(posts_id: any, request: Request): Promise<any> {

    //get user from token
    const user_req = request.headers[USER_ID_HEADER_NAME];

    const postsQuery = await this.postsRepository
      .createQueryBuilder('p')
      .leftJoin('p.creater', 'creater')
      .addSelect(['creater.fullname', 'creater.id', 'creater.avatar'])
      .where('p.share=:posts_id', { posts_id: posts_id })
      .getMany()


    const reactionPosts = await this.postsRepository.createQueryBuilder('p')
      .leftJoinAndSelect(
        (qb) =>
          qb.subQuery()
            .select('c.posts', 'posts_id')
            .addSelect('COUNT(c.posts)', 'comment_count')
            .from(Comment, 'c')
            .groupBy('c.posts')
        ,
        'c',
        'c.posts_id = p.id'
      )
      .leftJoinAndSelect(
        (qb) =>
          qb.subQuery()
            .select('l.posts', 'posts_id')
            .addSelect('COUNT(l.posts)', 'like_count')
            .from(LikePost, 'l')
            .groupBy('l.posts'),
        'l',
        'l.posts_id = p.id'
      )
      .leftJoin(
        (qb) =>
          qb.subQuery()
            .leftJoinAndSelect(
              (qb) =>
                qb.subQuery()
                  .select('l.*')
                  .from(LikePost, 'l')
              ,
              'l', 'l.user=u.id'
            )
            .from(User, 'u')
            .where(`u.id=${user_req}`)
        , 'u', 'u.posts=p.id'
      )
      .leftJoinAndSelect(
        (qb) =>
          qb.subQuery()
            .select('p2.shareId')
            .addSelect('COUNT(p2.shareId)', 'share_count')
            .from(Posts, 'p2')
            .where("p2.shareId IS NOT NULL")
            .groupBy('p2.shareId')

        ,
        'p2', 'p2.shareId=p.id'
      )
      .select([
        'p2.share_count',
        'c.comment_count',
        'l.like_count',
        'u.reaction',
      ])
      .orderBy('p.create_at', 'DESC')
      .getRawMany();

    // Convert raws to our appropriate objects 
    const posts = postsQuery.map((v, i) => {
      return {
        ...v,
        ...reactionPosts[i]
      }
    })

    return posts

  }

  async update(id: number, updatePostDto: UpdatePostDto) {
    try {
      const postsOld = await this.postsRepository.findOne(
        {
          where: {
            id: id
          }
        })

      const { tags, medias, ...rest } = updatePostDto


      //create tags
      if (tags) {

        await this.tagRepository.createQueryBuilder()
          .delete()
          .where("posts_id = :id", { id: id })
          .execute()

        const tagsCreate = tags.map(t => {
          return {
            ...t,
            posts_id: id
          }
        })

        await this.tagRepository.insert(tagsCreate);

      }
      //create media
      if (medias) {

        await this.mediaRepository.createQueryBuilder()
          .delete()
          .where("posts_id = :id", { id: id })
          .execute()

        const mediasCreate = medias.map(m => {
          return {
            ...m,
            posts_id: id
          }
        })
        await this.mediaRepository.insert(mediasCreate);
      }

      await this.postsRepository.save({
        ...postsOld,
        ...rest
      })

      return {
        status:1,
        message:"OKE"
      };
    } catch (error) {
      return {
        status:-1,
        message:"Lỗi nè"+error
      };

    }
  }

  async remove(id: number) {
    try {
      // await this.likePostRepository.delete({
      //   posts:id
      // })

      const comment = await this.commentRepository.findOne({
        where:{
          posts:id
        }
      })

      let commentChildren = await this.commentRepository
      .createQueryBuilder('c')
      .where(`c.parent = ${comment.id}`)
      .getMany()

      //filter id commentchildren
      const commentChildrenID=commentChildren.map(c=>c.id)
      
      if(commentChildrenID.length > 0){
        await this.likeCommentRepository
        .createQueryBuilder()
        .delete()
        .from(LikeComment)
        .where(`comment = ${comment.id} OR comment IN (:...comment_ids)`,{comment_ids:commentChildrenID})
        .execute()      
      }

      await this.commentRepository
      .createQueryBuilder()
      .delete()
      .from(Comment)
      .where(`parent = :commentID`,{commentID:comment.id})
      .orWhere(`posts = ${id}`)
      .execute()
      

      await this.mediaRepository.delete({
        posts_id:id
      })
      await this.tagRepository.delete({
        posts_id:id
      })
      await this.postsRepository.delete({ id: id })

      return {
        status:1,
        message:'OK'
      };
    } catch (error) {
      return {
        status:-1,
        message:''+error
      };
    }
    
  }
}
