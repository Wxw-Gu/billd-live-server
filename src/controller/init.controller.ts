import { ParameterizedContext } from 'koa';

import successHandler from '@/app/handler/success-handle';
import sequelize from '@/config/mysql';
import { ALLOW_HTTP_CODE, PROJECT_ENV, THIRD_PLATFORM } from '@/constant';
import {
  bulkCreateAuth,
  bulkCreateGoods,
  bulkCreateRole,
  bulkCreateRoleAuth,
} from '@/init/initData';
import { initDb } from '@/init/initDb';
import authModel from '@/model/auth.model';
import { CustomError } from '@/model/customError.model';
import dayDataModel from '@/model/dayData.model';
import goodsModel from '@/model/goods.model';
import liveRoomModel from '@/model/liveRoom.model';
import qqUserModel from '@/model/qqUser.model';
import roleModel from '@/model/role.model';
import roleAuthModel from '@/model/roleAuth.model';
import thirdUserModel from '@/model/thirdUser.model';
import userModel from '@/model/user.model';
import userLiveRoomModel from '@/model/userLiveRoom.model';
import userRoleModel from '@/model/userRole.model';

const sql1 = `
DROP PROCEDURE IF EXISTS insert_many_dates;
`;

const sql2 = `
CREATE DEFINER = root @'%' PROCEDURE insert_many_dates ( number_to_insert INT ) BEGIN

	SET @x = 0;

	SET @date = '2022-01-01';
	REPEAT

			SET @x = @x + 1;
		INSERT INTO day_data ( today, created_at, updated_at )
		VALUES
			( @date, NOW(), NOW() );

		SET @date = DATE_ADD( @date, INTERVAL 1 DAY );
		UNTIL @x >= number_to_insert
	END REPEAT;

END
`;

const sql3 = `call insert_many_dates(3650)`;

class InitController {
  // 初始化角色
  async initRole(ctx: ParameterizedContext, next) {
    const count = await roleModel.count();
    if (count === 0) {
      await roleModel.bulkCreate(bulkCreateRole);
      successHandler({ ctx, message: '初始化角色成功！' });
    } else {
      throw new CustomError(
        '已经初始化过角色，不能再初始化了！',
        ALLOW_HTTP_CODE.paramsError,
        ALLOW_HTTP_CODE.paramsError
      );
    }
    await next();
  }

  // 初始化权限
  async initAuth(ctx: ParameterizedContext, next) {
    const count = await authModel.count();
    if (count === 0) {
      await authModel.bulkCreate(bulkCreateAuth);
      successHandler({ ctx, message: '初始化权限成功！' });
    } else {
      throw new CustomError(
        '已经初始化过权限了，不能再初始化了！',
        ALLOW_HTTP_CODE.paramsError,
        ALLOW_HTTP_CODE.paramsError
      );
    }

    await next();
  }

  // 初始化商品
  async initGoods(ctx: ParameterizedContext) {
    const count = await goodsModel.count();
    if (count === 0) {
      await goodsModel.bulkCreate(bulkCreateGoods);
      successHandler({ ctx, message: '初始化商品成功！' });
    } else {
      throw new CustomError(
        '已经初始化过商品了，不能再初始化了！',
        ALLOW_HTTP_CODE.paramsError,
        ALLOW_HTTP_CODE.paramsError
      );
    }
  }

  // 初始化角色权限
  async initRoleAuth(ctx: ParameterizedContext) {
    const count = await roleAuthModel.count();
    if (count === 0) {
      await roleAuthModel.bulkCreate(bulkCreateRoleAuth);
      successHandler({ ctx, message: '初始化角色权限成功！' });
    } else {
      throw new CustomError(
        '已经初始化过角色权限了，不能再初始化了！',
        ALLOW_HTTP_CODE.paramsError,
        ALLOW_HTTP_CODE.paramsError
      );
    }
  }

  // 初始化数据库
  async initDatabase(ctx: ParameterizedContext, next) {
    const queryInterface = sequelize.getQueryInterface();
    const allTables = await queryInterface.showAllTables();
    if (!allTables.length) {
      await initDb('force');
      successHandler({ ctx, data: '初始化数据库成功！' });
    } else {
      throw new CustomError(
        '已经初始化过数据库了，不能再初始化了！',
        ALLOW_HTTP_CODE.paramsError,
        ALLOW_HTTP_CODE.paramsError
      );
    }

    await next();
  }

  // 初始化时间表
  async initDayData(ctx: ParameterizedContext, next) {
    const count = await dayDataModel.count();
    if (count === 0) {
      await sequelize.query(sql1);
      await sequelize.query(sql2);
      await sequelize.query(sql3);
      successHandler({ ctx, data: '初始化时间表成功！' });
    } else {
      throw new CustomError(
        '已经初始化过时间表了，不能再初始化了！',
        ALLOW_HTTP_CODE.paramsError,
        ALLOW_HTTP_CODE.paramsError
      );
    }

    await next();
  }

  // 初始化管理员
  async initAdminUser(ctx: ParameterizedContext, next) {
    const count = await userModel.count();
    if (count === 0) {
      const adminUser: any = await userModel.create({
        username: 'admin',
        password: '123456',
      });
      adminUser.setRoles([3, 7]);
      successHandler({ ctx, data: '初始化管理员成功！' });
    } else {
      throw new CustomError(
        '已经初始化过管理员了，不能再初始化了！',
        ALLOW_HTTP_CODE.paramsError,
        ALLOW_HTTP_CODE.paramsError
      );
    }

    await next();
  }

  deleteUser = async (ctx: ParameterizedContext, next) => {
    if (PROJECT_ENV !== 'development') {
      throw new CustomError(
        '非开发环境，不能删除用户！',
        ALLOW_HTTP_CODE.paramsError,
        ALLOW_HTTP_CODE.paramsError
      );
    }
    const { userId } = ctx.request.body;
    const res1 = await thirdUserModel.findAndCountAll({
      where: { user_id: userId },
    });
    const promise1: any[] = [];
    res1.rows.forEach((item) => {
      if (item.third_platform === THIRD_PLATFORM.qq) {
        promise1.push(
          qqUserModel.destroy({ where: { id: item.third_user_id } })
        );
      }
    });
    // 删除该用户的第三方用户信息（qq、github表）
    await Promise.all(promise1);
    // 删除该用户（user表）
    await userModel.destroy({ where: { id: userId } });
    // 删除该用户的第三方用户信息（third_user表）
    await thirdUserModel.destroy({ where: { user_id: userId } });

    // 删除该用户的所有角色（user_role表）
    await userRoleModel.destroy({ where: { user_id: userId } });

    const res2 = await userLiveRoomModel.findAndCountAll({
      where: { user_id: userId },
    });
    const promise2: any[] = [];
    res2.rows.forEach((item) => {
      promise2.push(
        liveRoomModel.destroy({ where: { id: item.live_room_id } })
      );
    });

    // 删除该用户的所有直播间（live_room表）
    await Promise.all(promise2);
    // 删除该用户的直播间(user_live_room表）
    await userLiveRoomModel.destroy({ where: { user_id: userId } });

    successHandler({ ctx, data: '删除用户成功！' });
    await next();
  };
}

export default new InitController();
