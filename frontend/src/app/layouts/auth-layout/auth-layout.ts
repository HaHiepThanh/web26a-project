import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Layout cho các trang xác thực (login/register/forgot/reset): canh giữa, không header.
 */
@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet],
  templateUrl: './auth-layout.html',
  styleUrl: './auth-layout.css',
})
export class AuthLayout {}
